/**
 * seed-aegis-from-m365.ts — AEGIS Postgres sync after M365 tenant
 * provisioning.
 *
 * Run via the PowerShell helper:
 *   pnpm --filter @aegis/db exec tsx scripts/seed-aegis-from-m365.ts [flags]
 *
 * Flags:
 *   --verify-only        Print state, make no changes
 *   --with-draft-holds   Also create draft Legal Holds per matter
 *   --wipe               Mark seeded Persons as wiped (or hard-delete with --hard-delete)
 *   --hard-delete        Combined with --wipe, delete instead of flagging
 *
 * Idempotency: every upsert is keyed on a stable identifier
 * (Person.email within demo org; Matter.id; MatterParty unique).
 *
 * The PowerShell side handles all M365 provisioning; this script
 * does only Postgres work. It reads seed-data/users.json and the
 * matter manifests to drive its writes — same source of truth as
 * the orchestrator.
 *
 * Architectural note: this script lives outside packages/db on
 * purpose. It is a build-time / dev-only tool driven by the M365
 * seed orchestrator and not part of the @aegis/db package surface.
 * It is allowed to import @aegis/db (via the workspace) the same
 * way prisma/seed.ts does — both are dev tooling, not runtime app
 * code.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PrismaClient,
  PersonType,
  MatterType,
  MatterStatus,
  MatterPartyRole,
  LegalHoldStatus,
} from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_DATA = join(__dirname, "seed-data");
const SEED_BATCH_TAG = "m365-2026-05";
const DEMO_ORG_NAME = "AEGIS Demo Corp";

// ───────────────────────────────────────────────────────────────────
// Argv
// ───────────────────────────────────────────────────────────────────

const argv = new Set(process.argv.slice(2));
const VERIFY_ONLY = argv.has("--verify-only");
const WITH_DRAFT_HOLDS = argv.has("--with-draft-holds");
const WIPE = argv.has("--wipe");
const HARD_DELETE = argv.has("--hard-delete");

// ───────────────────────────────────────────────────────────────────
// Type helpers for the JSON files
// ───────────────────────────────────────────────────────────────────

type UserSpec = {
  key: string;
  upnLocalPart: string;
  displayName: string;
  givenName: string;
  surname: string;
  jobTitle: string;
  department: string;
  officeLocation: string;
  city: string;
  state: string;
  country: string;
  usageLocation: string;
  accountEnabled: boolean;
  personType: keyof typeof PersonType;
  aegisRole: string | null;
  departed?: { departedAt: string; reason: string };
};

type MatterSpec = {
  matterId: string;
  title: string;
  type: keyof typeof MatterType;
  jurisdiction: string;
  leadAttorney: string;
  custodianKeys: string[];
};

type SeedStateUserRow = { upn: string; id: string; createdAt: string };
type SeedStateSiteRow = { groupId: string; siteId: string; webUrl: string };

// ───────────────────────────────────────────────────────────────────
// Loading
// ───────────────────────────────────────────────────────────────────

function loadJson<T>(rel: string): T {
  return JSON.parse(readFileSync(join(SEED_DATA, rel), "utf8")) as T;
}

function tenant(): string {
  const t = process.env.M365_TENANT?.trim();
  if (!t) {
    throw new Error(
      "M365_TENANT environment variable is required (e.g. 6bs6wq.onmicrosoft.com).",
    );
  }
  return t;
}

function loadSeedState(): {
  users?: Record<string, SeedStateUserRow>;
  sites?: Record<string, SeedStateSiteRow>;
} {
  try {
    return JSON.parse(
      readFileSync(join(__dirname, ".seed-state.json"), "utf8"),
    );
  } catch {
    return {};
  }
}

function loadUsers(): UserSpec[] {
  return loadJson<{ users: UserSpec[] }>("users.json").users;
}

function loadMatters(): MatterSpec[] {
  const dir = join(SEED_DATA, "matters");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as MatterSpec);
}

// ───────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const t = tenant();
  console.log(`[aegis-sync] Tenant: ${t}`);
  console.log(
    `[aegis-sync] Mode: ${
      WIPE ? "wipe" : VERIFY_ONLY ? "verify-only" : "seed"
    }${WITH_DRAFT_HOLDS ? " +holds" : ""}`,
  );

  const org = await prisma.organization.findFirst({
    where: { name: DEMO_ORG_NAME },
  });
  if (!org) {
    throw new Error(
      `Organization "${DEMO_ORG_NAME}" not found. Run \`pnpm --filter @aegis/db db:seed\` first.`,
    );
  }
  console.log(`[aegis-sync] Org: ${org.id}`);

  const users = loadUsers();
  const matters = loadMatters();
  const state = loadSeedState();

  if (WIPE) {
    await wipe(org.id, users);
    return;
  }

  // 1) Person upserts
  const personMap = await syncPersons(org.id, users, t, state.users ?? {});

  // 2) Matter upserts
  const matterMap = await syncMatters(org.id, matters, personMap);

  // 3) MatterParty links
  await syncMatterParties(matters, matterMap, personMap);

  // 4) Optional: draft Legal Holds
  if (WITH_DRAFT_HOLDS) {
    await syncDraftHolds(org.id, matters, matterMap, personMap);
  }

  console.log("[aegis-sync] Done.");
}

// ───────────────────────────────────────────────────────────────────
// Persons
// ───────────────────────────────────────────────────────────────────

async function syncPersons(
  orgId: string,
  users: UserSpec[],
  tenantDomain: string,
  stateUsers: Record<string, SeedStateUserRow>,
): Promise<Record<string, string>> {
  console.log(`[aegis-sync] Syncing ${users.length} Person rows`);
  const map: Record<string, string> = {};

  for (const u of users) {
    const email = `${u.upnLocalPart}@${tenantDomain}`;
    const m365Id = stateUsers[u.key]?.id ?? null;

    const metadata: Record<string, unknown> = {
      seedBatch: SEED_BATCH_TAG,
      m365: {
        upn: email,
        userId: m365Id,
        department: u.department,
        jobTitle: u.jobTitle,
        officeLocation: u.officeLocation,
      },
    };
    if (u.departed) {
      metadata.departed = u.departed;
    }

    const existing = await prisma.person.findFirst({
      where: { organizationId: orgId, email },
    });

    if (VERIFY_ONLY) {
      console.log(
        existing
          ? `  ✓ ${email} — Person ${existing.id}`
          : `  ⚠ ${email} — MISSING`,
      );
      if (existing) map[u.key] = existing.id;
      continue;
    }

    const personType = PersonType[u.personType];
    if (existing) {
      const updated = await prisma.person.update({
        where: { id: existing.id },
        data: {
          name: u.displayName,
          email,
          type: personType,
          metadata: metadata as never,
        },
      });
      map[u.key] = updated.id;
      console.log(`  ✓ ${email} — updated (Person ${updated.id})`);
    } else {
      const created = await prisma.person.create({
        data: {
          organizationId: orgId,
          type: personType,
          name: u.displayName,
          email,
          metadata: metadata as never,
        },
      });
      map[u.key] = created.id;
      console.log(`  ✓ ${email} — created (Person ${created.id})`);
    }
  }

  return map;
}

// ───────────────────────────────────────────────────────────────────
// Matters
// ───────────────────────────────────────────────────────────────────

async function syncMatters(
  orgId: string,
  matters: MatterSpec[],
  personMap: Record<string, string>,
): Promise<Record<string, string>> {
  console.log(`[aegis-sync] Syncing ${matters.length} matters`);
  const map: Record<string, string> = {};

  // Number sequence per type — read existing matters to avoid duplicates.
  // Format: M-{TYPE}-{YYYY}-{SEQ:4}
  const year = new Date().getFullYear();

  for (const m of matters) {
    const leadId = personMap[m.leadAttorney];
    if (!leadId) {
      console.warn(
        `  ⚠ matter ${m.matterId}: leadAttorney "${m.leadAttorney}" missing in person map — skipping`,
      );
      continue;
    }

    if (VERIFY_ONLY) {
      const existing = await prisma.matter.findUnique({
        where: { id: m.matterId },
      });
      console.log(
        existing
          ? `  ✓ ${m.matterId} — present`
          : `  ⚠ ${m.matterId} — MISSING`,
      );
      if (existing) map[m.matterId] = existing.id;
      continue;
    }

    const existing = await prisma.matter.findUnique({
      where: { id: m.matterId },
    });

    if (existing) {
      // Don't churn the existing m-snowflake-msa created by the
      // base seed. Just ensure our extended fields are in sync.
      await prisma.matter.update({
        where: { id: m.matterId },
        data: {
          leadAttorneyId: leadId,
          jurisdiction: m.jurisdiction,
        },
      });
      map[m.matterId] = existing.id;
      console.log(`  ✓ ${m.matterId} — present, lead/jurisdiction in sync`);
    } else {
      const seq = await nextSequence(orgId, MatterType[m.type], year);
      const matterNumber = `M-${typePrefix(m.type)}-${year}-${String(seq).padStart(4, "0")}`;
      const created = await prisma.matter.create({
        data: {
          id: m.matterId,
          organizationId: orgId,
          title: m.title,
          matterNumber,
          type: MatterType[m.type],
          status: MatterStatus.ACTIVE,
          jurisdiction: m.jurisdiction,
          leadAttorneyId: leadId,
          description: m.title,
          metadata: { seedBatch: SEED_BATCH_TAG },
        },
      });
      map[m.matterId] = created.id;
      console.log(
        `  ✓ ${m.matterId} — created (matterNumber ${matterNumber})`,
      );
    }
  }

  return map;
}

function typePrefix(t: keyof typeof MatterType): string {
  switch (t) {
    case "LITIGATION":
      return "LIT";
    case "TRANSACTIONAL":
      return "TXN";
    case "MA":
      return "MA";
    case "IP":
      return "IP";
    case "EMPLOYMENT":
      return "EMP";
    case "REGULATORY":
      return "REG";
    case "INVESTIGATION":
      return "INV";
    case "ADVISORY":
      return "ADV";
    default:
      return "OTH";
  }
}

async function nextSequence(
  orgId: string,
  type: MatterType,
  year: number,
): Promise<number> {
  const start = new Date(`${year}-01-01T00:00:00Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00Z`);
  const count = await prisma.matter.count({
    where: {
      organizationId: orgId,
      type,
      openedAt: { gte: start, lt: end },
    },
  });
  return count + 1;
}

// ───────────────────────────────────────────────────────────────────
// Matter parties
// ───────────────────────────────────────────────────────────────────

async function syncMatterParties(
  matters: MatterSpec[],
  matterMap: Record<string, string>,
  personMap: Record<string, string>,
): Promise<void> {
  console.log("[aegis-sync] Syncing matter party links");
  for (const m of matters) {
    const matterId = matterMap[m.matterId];
    if (!matterId) continue;

    // Lead attorney
    const leadPersonId = personMap[m.leadAttorney];
    if (leadPersonId && !VERIFY_ONLY) {
      await prisma.matterParty.upsert({
        where: {
          matterId_personId_role: {
            matterId,
            personId: leadPersonId,
            role: MatterPartyRole.LEAD_ATTORNEY,
          },
        },
        update: {},
        create: {
          matterId,
          personId: leadPersonId,
          role: MatterPartyRole.LEAD_ATTORNEY,
        },
      });
    }

    // Custodians
    for (const ck of m.custodianKeys) {
      const personId = personMap[ck];
      if (!personId) continue;
      if (personId === leadPersonId) continue; // already added as LEAD_ATTORNEY
      if (VERIFY_ONLY) continue;
      await prisma.matterParty.upsert({
        where: {
          matterId_personId_role: {
            matterId,
            personId,
            role: MatterPartyRole.CUSTODIAN,
          },
        },
        update: {},
        create: {
          matterId,
          personId,
          role: MatterPartyRole.CUSTODIAN,
        },
      });
    }
    console.log(`  ✓ ${m.matterId} — ${m.custodianKeys.length} custodian link(s)`);
  }
}

// ───────────────────────────────────────────────────────────────────
// Draft holds (optional)
// ───────────────────────────────────────────────────────────────────

async function syncDraftHolds(
  orgId: string,
  matters: MatterSpec[],
  matterMap: Record<string, string>,
  personMap: Record<string, string>,
): Promise<void> {
  console.log("[aegis-sync] Creating draft Legal Holds per matter");

  // Holds need a User id for createdById. The base seed creates the
  // demo admin User; resolve it once.
  const adminUser = await prisma.user.findFirst({
    where: { organizationId: orgId, name: "Alex Nguyen" },
  });
  if (!adminUser) {
    console.warn(
      "  ⚠ No admin User row found — skipping draft hold creation (the base seed must run first).",
    );
    return;
  }

  for (const m of matters) {
    const matterId = matterMap[m.matterId];
    if (!matterId) continue;
    const id = `lh-seed-${m.matterId}`;
    const existing = await prisma.legalHold.findUnique({ where: { id } });
    if (existing) {
      console.log(`  · ${id} — exists, skipping`);
      continue;
    }
    if (VERIFY_ONLY) {
      console.log(`  ⚠ ${id} — would create`);
      continue;
    }
    const hold = await prisma.legalHold.create({
      data: {
        id,
        organizationId: orgId,
        matterId,
        title: `${m.title} — Preservation`,
        scopeDescription: `Email, OneDrive, SharePoint, and Teams data related to ${m.title} from January 2025 forward.`,
        status: LegalHoldStatus.DRAFT,
        jurisdictions: [m.jurisdiction],
        createdById: adminUser.id,
      },
    });
    for (const ck of m.custodianKeys) {
      const personId = personMap[ck];
      if (!personId) continue;
      try {
        await prisma.legalHoldCustodian.create({
          data: {
            legalHoldId: hold.id,
            personId,
          },
        });
      } catch {
        // unique constraint — ignore
      }
    }
    console.log(
      `  ✓ ${id} — created with ${m.custodianKeys.length} custodian(s)`,
    );
  }
}

// ───────────────────────────────────────────────────────────────────
// Wipe
// ───────────────────────────────────────────────────────────────────

async function wipe(orgId: string, users: UserSpec[]): Promise<void> {
  const t = tenant();
  console.log(
    `[aegis-sync] Wipe pass — ${HARD_DELETE ? "hard delete" : "metadata flag only"}`,
  );

  for (const u of users) {
    const email = `${u.upnLocalPart}@${t}`;
    const existing = await prisma.person.findFirst({
      where: { organizationId: orgId, email },
    });
    if (!existing) {
      console.log(`  · ${email} — not present, skipping`);
      continue;
    }

    if (HARD_DELETE) {
      // First remove MatterParty rows referencing this person, then delete
      await prisma.matterParty.deleteMany({ where: { personId: existing.id } });
      await prisma.legalHoldCustodian.deleteMany({
        where: { personId: existing.id },
      });
      await prisma.person.delete({ where: { id: existing.id } });
      console.log(`  ✓ ${email} — hard-deleted`);
    } else {
      const meta = (existing.metadata ?? {}) as Record<string, unknown>;
      meta.wiped = true;
      meta.wipedAt = new Date().toISOString();
      await prisma.person.update({
        where: { id: existing.id },
        data: { metadata: meta as never },
      });
      console.log(`  ✓ ${email} — flagged wiped`);
    }
  }
}

// ───────────────────────────────────────────────────────────────────
// Entry
// ───────────────────────────────────────────────────────────────────

main()
  .catch((err) => {
    console.error("[aegis-sync] FAILED:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
