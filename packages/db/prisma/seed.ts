/**
 * AEGIS demo seed.
 *
 * Run via `pnpm --filter @aegis/db db:seed`. The seed is idempotent —
 * every insert uses upsert keyed on a stable unique field, so re-running
 * does not create duplicates. To start clean, `pnpm --filter @aegis/db
 * db:reset` drops and re-applies migrations + reseeds in one go.
 *
 * The seed is NOT a fixture for tests; it is the demo dataset that
 * Mission Control / Cockpit / Copilot render against. Numbers are
 * tuned so the v8 demo's narrative still lands (8 cockpit tickets,
 * 5 bulk NDAs, attorney "Alex Nguyen" reviews).
 *
 * Sections (commit-aligned):
 *   1. Organization + Role + User + Alex Nguyen Person
 *   2. Shared entities — Counterparties, Persons (requesters), demo Tags
 *   3. Matters + Legal Holds
 *   4. Intake tickets — v72 + v8 cockpit + v8 bulk NDAs
 *   5. Spend — Vendors, Invoices, Budgets
 *   6. Privacy — sample DSAR + ConsentRecord
 */

import {
  PrismaClient,
  PersonType,
  CounterpartyType,
  MatterType,
  MatterStatus,
  MatterPartyRole,
  LegalHoldStatus,
  PreservationDataSource,
  IntakeSource,
  IntakeStatus,
  AgentRecommendationStatus,
  ConversationRole,
} from "@prisma/client";
// Build-time relative import — see CLAUDE.md "Documented exceptions".
// The canonical role definitions live in @aegis/auth, but adding
// @aegis/auth as a package dep here would close a turbo-detected
// cycle (@aegis/auth depends on @aegis/db at runtime). The seed is
// a dev-only tool — relative path is the cleanest way to read the
// canonical bundle without creating a package-graph edge.
import {
  ROLE_PERMISSIONS,
  ALL_ROLES,
  type RoleName,
} from "../../auth/src/roles";

const prisma = new PrismaClient();

// ───────────────────────────────────────────────────────────────────
// Constants — known external refs make the seed re-runnable.
// ───────────────────────────────────────────────────────────────────

const DEMO_ORG_NAME = "AEGIS Demo Corp";
const DEMO_USER_NAME = "Alex Nguyen";

/**
 * Admin email — env-driven so production deploys use a real, verifiable
 * address that the admin can actually sign in with via Auth0. The
 * fallback (`alex.nguyen@aegis-demo.example`) is a non-routable demo
 * domain and is intended for local dev / CI only.
 *
 * In production, set `SEED_ADMIN_EMAIL` in Vercel to the same email
 * the admin will sign up with on Auth0; otherwise `getResolvedUser()`
 * in @aegis/auth/server won't find a User row matching the session
 * email and the dashboard will appear empty.
 *
 * Idempotency: this seed identifies the admin by `name === "Alex Nguyen"`
 * within the demo org rather than by email, so changing
 * `SEED_ADMIN_EMAIL` between runs updates the existing row's email
 * instead of creating a duplicate User.
 */
const DEMO_USER_EMAIL =
  (process.env.SEED_ADMIN_EMAIL ?? "").trim() ||
  "alex.nguyen@aegis-demo.example";

// ───────────────────────────────────────────────────────────────────
// Section 1 — Organization, Role, User, Alex Nguyen Person
// ───────────────────────────────────────────────────────────────────
//
// admin Role is created here with the canonical permission set from
// @aegis/auth.ROLE_PERMISSIONS. Section 7 re-upserts every role
// (including admin) idempotently, but seeding admin in §1 first lets
// us link Alex's User row immediately.

async function seedOrgAndAdmin() {
  const org = await prisma.organization.upsert({
    where: { id: "demo-org" }, // synthetic stable id so re-runs hit upsert
    update: { name: DEMO_ORG_NAME },
    create: {
      id: "demo-org",
      name: DEMO_ORG_NAME,
      tier: "DEMO",
      region: "US",
    },
  });

  const adminPermissions = Array.from(ROLE_PERMISSIONS.admin);
  const adminRole = await prisma.role.upsert({
    where: {
      organizationId_name: { organizationId: org.id, name: "admin" },
    },
    update: { permissions: adminPermissions },
    create: {
      organizationId: org.id,
      name: "admin",
      permissions: adminPermissions,
    },
  });

  // Identify the admin User by name within the demo org, NOT by email.
  // SEED_ADMIN_EMAIL can change between runs (production rotates it from
  // the dev fallback to the real Auth0 sign-in address); upserting by
  // email would create a duplicate User on every change. Looking up by
  // name keeps us on the same row and just rewrites its email.
  const existingAdmin = await prisma.user.findFirst({
    where: { organizationId: org.id, name: DEMO_USER_NAME },
  });
  const user = existingAdmin
    ? await prisma.user.update({
        where: { id: existingAdmin.id },
        data: {
          email: DEMO_USER_EMAIL,
          name: DEMO_USER_NAME,
          roleId: adminRole.id,
        },
      })
    : await prisma.user.upsert({
        where: {
          organizationId_email: {
            organizationId: org.id,
            email: DEMO_USER_EMAIL,
          },
        },
        update: { name: DEMO_USER_NAME, roleId: adminRole.id },
        create: {
          organizationId: org.id,
          email: DEMO_USER_EMAIL,
          name: DEMO_USER_NAME,
          roleId: adminRole.id,
        },
      });

  // Alex Nguyen also exists as a Person (the attorney reviewing tickets,
  // assigned to Matters, etc.). userId links the two records — same
  // human, two roles in the data model. We pin a synthetic stable id
  // so re-running the seed upserts the same row.
  const alexPerson = await prisma.person.upsert({
    where: { id: "demo-person-alex" },
    update: { name: DEMO_USER_NAME, userId: user.id, email: DEMO_USER_EMAIL },
    create: {
      id: "demo-person-alex",
      organizationId: org.id,
      type: PersonType.EMPLOYEE,
      userId: user.id,
      externalRef: "user:alex.nguyen",
      name: DEMO_USER_NAME,
      email: DEMO_USER_EMAIL,
      metadata: { title: "Senior Attorney", role: "intake_lead" },
    },
  });

  return { org, adminRole, user, alexPerson };
}

// ───────────────────────────────────────────────────────────────────
// Section 2 — Counterparties, requester Persons, demo Tags
// ───────────────────────────────────────────────────────────────────
//
// Counterparty list mirrors the entities mentioned in the v8 cockpit
// seed + bulk NDA seed: Acme Corp, Snowflake, Saigon Tech Labs, plus
// the bulk NDA roster (Globex, Initech, Umbrella, Soylent, Wayne).
// Real demo would also include law firms — those land in Section 5
// when Vendors get seeded.

const COUNTERPARTIES: Array<{
  id: string;
  name: string;
  type: CounterpartyType;
  country?: string;
  metadata?: Record<string, unknown>;
}> = [
  { id: "cp-acme", name: "Acme Corp", type: CounterpartyType.COMPANY, country: "US" },
  { id: "cp-snowflake", name: "Snowflake Inc.", type: CounterpartyType.COMPANY, country: "US" },
  { id: "cp-saigon", name: "Saigon Tech Labs", type: CounterpartyType.COMPANY, country: "VN", metadata: { dataProcessor: true } },
  { id: "cp-deloitte", name: "Deloitte", type: CounterpartyType.COMPANY, country: "US" },
  { id: "cp-globex", name: "Globex Industries", type: CounterpartyType.COMPANY, country: "US" },
  { id: "cp-initech", name: "Initech Solutions", type: CounterpartyType.COMPANY, country: "US" },
  { id: "cp-umbrella", name: "Umbrella Corp", type: CounterpartyType.COMPANY, country: "US" },
  { id: "cp-soylent", name: "Soylent Group", type: CounterpartyType.COMPANY, country: "US" },
  { id: "cp-wayne", name: "Wayne Enterprises", type: CounterpartyType.COMPANY, country: "US" },
  { id: "cp-datastream", name: "DataStream AI", type: CounterpartyType.COMPANY, country: "US", metadata: { dataProcessor: true } },
];

// Requesters across v72 + v8 cockpit + v8 bulk NDA seeds.
// type=EMPLOYEE — they are internal staff filing legal intake tickets.
const REQUESTERS: Array<{
  id: string;
  name: string;
  email: string;
  department: string;
}> = [
  // v8 cockpit requesters (REQ-3501..3508)
  { id: "p-james", name: "James Holloway", email: "james.holloway@aegis-demo.example", department: "Sales — Enterprise" },
  { id: "p-rhea", name: "Rhea Malhotra", email: "rhea.malhotra@aegis-demo.example", department: "Finance" },
  { id: "p-dmitri", name: "Dmitri Volkov", email: "dmitri.volkov@aegis-demo.example", department: "Procurement — APAC" },
  { id: "p-aisha", name: "Aisha Patel", email: "aisha.patel@aegis-demo.example", department: "Marketing" },
  { id: "p-marcus", name: "Marcus Reid", email: "marcus.reid@aegis-demo.example", department: "HR" },
  { id: "p-elena", name: "Elena Rodriguez", email: "elena.rodriguez@aegis-demo.example", department: "Engineering" },
  { id: "p-priya", name: "Priya Kulkarni", email: "priya.kulkarni@aegis-demo.example", department: "Engineering" },
  { id: "p-nikhil", name: "Nikhil Shah", email: "nikhil.shah@aegis-demo.example", department: "Corporate Development" },
  // v72 requesters (REQ-3401..3404)
  { id: "p-sarah", name: "Sarah Johnson", email: "sarah.johnson@aegis-demo.example", department: "Product" },
  { id: "p-mike", name: "Mike Peters", email: "mike.peters@aegis-demo.example", department: "Engineering" },
  { id: "p-lisa", name: "Lisa Wang", email: "lisa.wang@aegis-demo.example", department: "HR" },
  { id: "p-tom", name: "Tom Bradley", email: "tom.bradley@aegis-demo.example", department: "Procurement" },
  // bulk NDA requesters (REQ-3601..3605)
  { id: "p-alexk", name: "Alex Kim", email: "alex.kim@aegis-demo.example", department: "Sales — Enterprise" },
  { id: "p-mayac", name: "Maya Chen", email: "maya.chen@aegis-demo.example", department: "Partnerships" },
  { id: "p-ryan", name: "Ryan O'Brien", email: "ryan.obrien@aegis-demo.example", department: "Corp Dev" },
  { id: "p-sofia", name: "Sofia Ramirez", email: "sofia.ramirez@aegis-demo.example", department: "BD" },
  { id: "p-nathan", name: "Nathan Webb", email: "nathan.webb@aegis-demo.example", department: "Strategy" },
];

// Demo tags. Categories mirror the Aurora visual language.
const TAGS: Array<{
  id: string;
  name: string;
  category: string;
  color: string;
}> = [
  { id: "tag-high-risk", name: "high-risk", category: "risk", color: "#E5484D" },
  { id: "tag-ai-triaged", name: "ai-triaged", category: "lifecycle", color: "#7E5BEF" },
  { id: "tag-external-counsel", name: "external-counsel", category: "domain", color: "#3491FA" },
  { id: "tag-template-fit", name: "template-fit", category: "intake", color: "#34D399" },
  { id: "tag-data-processing", name: "data-processing", category: "privacy", color: "#F59E0B" },
];

async function seedCounterparties(orgId: string) {
  for (const cp of COUNTERPARTIES) {
    await prisma.counterparty.upsert({
      where: { id: cp.id },
      update: { name: cp.name, type: cp.type, country: cp.country ?? null },
      create: {
        id: cp.id,
        organizationId: orgId,
        name: cp.name,
        type: cp.type,
        country: cp.country ?? null,
        metadata: cp.metadata ?? {},
      },
    });
  }
  return COUNTERPARTIES.length;
}

async function seedRequesters(orgId: string) {
  for (const r of REQUESTERS) {
    await prisma.person.upsert({
      where: { id: r.id },
      update: { name: r.name, email: r.email },
      create: {
        id: r.id,
        organizationId: orgId,
        type: PersonType.EMPLOYEE,
        externalRef: `employee:${r.id}`,
        name: r.name,
        email: r.email,
        metadata: { department: r.department },
      },
    });
  }
  return REQUESTERS.length;
}

async function seedTags(orgId: string) {
  for (const t of TAGS) {
    await prisma.tag.upsert({
      where: { id: t.id },
      update: { name: t.name, category: t.category, color: t.color },
      create: {
        id: t.id,
        organizationId: orgId,
        name: t.name,
        category: t.category,
        color: t.color,
      },
    });
  }
  return TAGS.length;
}

// ───────────────────────────────────────────────────────────────────
// Section 3 — Matters + Legal Holds
// ───────────────────────────────────────────────────────────────────
//
// Three matters exercise the spine + the Legal Hold sub-domain:
//   m-snowflake-msa  — TRANSACTIONAL, open. The Snowflake MSA review
//                       (REQ-3506 in cockpit seed) escalated into a
//                       proper matter with a budget and pending
//                       invoices in Section 5.
//   m-emp-harassment — EMPLOYMENT, open, with a Legal Hold ISSUED.
//                       Tied to the v72 harassment escalation
//                       (REQ-3403). Two custodians under hold.
//   m-saigon-vendor  — ADVISORY, closed. The Saigon Tech Labs vendor
//                       onboarding (REQ-3503) — closed after DPA
//                       attached.

async function seedMatters(orgId: string, leadAttorneyPersonId: string) {
  // Snowflake MSA
  await prisma.matter.upsert({
    where: { id: "m-snowflake-msa" },
    update: { title: "Snowflake MSA — Renewal & Re-papering" },
    create: {
      id: "m-snowflake-msa",
      organizationId: orgId,
      title: "Snowflake MSA — Renewal & Re-papering",
      type: MatterType.TRANSACTIONAL,
      status: MatterStatus.OPEN,
      leadAttorneyId: leadAttorneyPersonId,
      counterpartyId: "cp-snowflake",
      description:
        "Re-papering of master services agreement. Engineering negotiating payment terms (counterparty proposed Net 30 vs our Net 45 playbook). IP § 8.2 ambiguous — flagged for IP team.",
      metadata: { exposure: "$2.4M annual", playbook: "MSA-v2" },
    },
  });

  // Saigon Tech Labs vendor onboarding (closed)
  await prisma.matter.upsert({
    where: { id: "m-saigon-vendor" },
    update: { title: "Saigon Tech Labs — Vendor Onboarding" },
    create: {
      id: "m-saigon-vendor",
      organizationId: orgId,
      title: "Saigon Tech Labs — Vendor Onboarding",
      type: MatterType.ADVISORY,
      status: MatterStatus.CLOSED,
      closedAt: new Date("2026-04-18T15:00:00Z"),
      leadAttorneyId: leadAttorneyPersonId,
      counterpartyId: "cp-saigon",
      description:
        "Onboarding analytics vendor processing anonymised data. Standard DPA v3.1 attached. Sanctions / ABC / World-Check all clear. Closed within 24h of intake.",
      metadata: { contractValue: "$180K/yr", dpaVersion: "3.1" },
    },
  });

  // Employment / harassment matter — has Legal Hold
  const empMatter = await prisma.matter.upsert({
    where: { id: "m-emp-harassment" },
    update: { title: "Confidential Employment Matter — VP Eng" },
    create: {
      id: "m-emp-harassment",
      organizationId: orgId,
      title: "Confidential Employment Matter — VP Eng",
      type: MatterType.EMPLOYMENT,
      status: MatterStatus.IN_PROGRESS,
      leadAttorneyId: leadAttorneyPersonId,
      description:
        "Harassment complaint filed against VP Engineering. External counsel engaged. Plaintiff's counsel has contacted HR directly. Subject to legal hold.",
      metadata: {
        sensitivity: "high",
        externalCounsel: "engaged",
        notes: "Names redacted in metadata; full record under access control.",
      },
    },
  });

  // Add Alex as lead attorney party on each matter (idempotent unique on
  // (matterId, personId, role)).
  const matterIds = ["m-snowflake-msa", "m-saigon-vendor", "m-emp-harassment"];
  for (const matterId of matterIds) {
    await prisma.matterParty.upsert({
      where: {
        matterId_personId_role: {
          matterId,
          personId: leadAttorneyPersonId,
          role: MatterPartyRole.LEAD_ATTORNEY,
        },
      },
      update: {},
      create: {
        matterId,
        personId: leadAttorneyPersonId,
        role: MatterPartyRole.LEAD_ATTORNEY,
      },
    });
  }

  return { empMatter };
}

async function seedLegalHold(orgId: string, empMatterId: string) {
  // Two custodian Persons specifically for the hold (data subject /
  // custodian role separate from any employee record they might also
  // have — Step 7+ identity-graph will resolve cross-role identities).
  const custodian1 = await prisma.person.upsert({
    where: { id: "p-cust-vp-eng" },
    update: { name: "[Redacted] VP Eng" },
    create: {
      id: "p-cust-vp-eng",
      organizationId: orgId,
      type: PersonType.CUSTODIAN,
      externalRef: "custodian:vp-eng-001",
      name: "[Redacted] VP Eng",
      email: "redacted-vp-eng@aegis-demo.example",
      metadata: { redacted: true, reason: "active investigation" },
    },
  });

  const custodian2 = await prisma.person.upsert({
    where: { id: "p-cust-team-lead" },
    update: { name: "[Redacted] Team Lead" },
    create: {
      id: "p-cust-team-lead",
      organizationId: orgId,
      type: PersonType.CUSTODIAN,
      externalRef: "custodian:team-lead-002",
      name: "[Redacted] Team Lead",
      email: "redacted-team-lead@aegis-demo.example",
      metadata: { redacted: true, reason: "active investigation" },
    },
  });

  const hold = await prisma.legalHold.upsert({
    where: { id: "lh-emp-harassment" },
    update: { status: LegalHoldStatus.ISSUED },
    create: {
      id: "lh-emp-harassment",
      matterId: empMatterId,
      organizationId: orgId,
      scope:
        "All email, chat, and document storage related to the VP Engineering team for the period 2026-01-01 forward.",
      status: LegalHoldStatus.ISSUED,
      issuedAt: new Date("2026-04-17T10:00:00Z"),
      reason:
        "Pending investigation of harassment complaint with external-counsel involvement.",
    },
  });

  // Notice rows — one per custodian. Acknowledged for custodian1, still
  // pending acknowledgement for custodian2 (drives the demo's "1 of 2
  // custodians acknowledged" UI when LegalHoldPanel ships in Step 4).
  await prisma.holdNotice.upsert({
    where: {
      holdId_custodianId: { holdId: hold.id, custodianId: custodian1.id },
    },
    update: { acknowledgedAt: new Date("2026-04-17T11:30:00Z") },
    create: {
      holdId: hold.id,
      custodianId: custodian1.id,
      sentAt: new Date("2026-04-17T10:05:00Z"),
      acknowledgedAt: new Date("2026-04-17T11:30:00Z"),
      attestationCount: 1,
    },
  });

  await prisma.holdNotice.upsert({
    where: {
      holdId_custodianId: { holdId: hold.id, custodianId: custodian2.id },
    },
    update: {},
    create: {
      holdId: hold.id,
      custodianId: custodian2.id,
      sentAt: new Date("2026-04-17T10:05:00Z"),
    },
  });

  // One attestation already on file for custodian1.
  await prisma.holdAttestation.upsert({
    where: { id: "att-emp-001" },
    update: {},
    create: {
      id: "att-emp-001",
      holdId: hold.id,
      custodianId: custodian1.id,
      period: "2026-04",
      attestedAt: new Date("2026-04-17T11:32:00Z"),
      responseJson: {
        confirmed: true,
        notes: "All matter-related communications preserved per scope.",
      },
    },
  });

  // Preservation orders — IT confirmed for email and files.
  await prisma.preservationOrder.upsert({
    where: { id: "po-emp-email" },
    update: {},
    create: {
      id: "po-emp-email",
      holdId: hold.id,
      dataSource: PreservationDataSource.EMAIL,
      dataSourceRef: "exchange:vp-eng-team",
      preservationTier: "enhanced",
      ITConfirmedAt: new Date("2026-04-17T10:45:00Z"),
    },
  });

  await prisma.preservationOrder.upsert({
    where: { id: "po-emp-files" },
    update: {},
    create: {
      id: "po-emp-files",
      holdId: hold.id,
      dataSource: PreservationDataSource.FILES,
      dataSourceRef: "sharepoint:eng-vp-team-site",
      preservationTier: "enhanced",
      ITConfirmedAt: new Date("2026-04-17T10:50:00Z"),
    },
  });

  return hold;
}

// ───────────────────────────────────────────────────────────────────
// Entry point
// ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("[seed] starting…");

  const { org, user, alexPerson } = await seedOrgAndAdmin();
  console.log(`[seed] org=${org.id} user=${user.id} alex=${alexPerson.id}`);

  const cpCount = await seedCounterparties(org.id);
  const reqCount = await seedRequesters(org.id);
  const tagCount = await seedTags(org.id);
  console.log(
    `[seed] counterparties=${cpCount} requesters=${reqCount} tags=${tagCount}`,
  );

  const { empMatter } = await seedMatters(org.id, alexPerson.id);
  const hold = await seedLegalHold(org.id, empMatter.id);
  console.log(`[seed] matters=3 legal_hold=${hold.id} (status=${hold.status})`);

  const tk = await seedTickets(org.id);
  console.log(
    `[seed] tickets=${tk.ticketCount} recommendations=${tk.recCount} conversation_messages=${tk.convCount} auto_persons=${tk.autoPersonCount}`,
  );

  const sp = await seedSpend(org.id);
  console.log(
    `[seed] vendors=${sp.vendors} timekeepers=${sp.timekeepers} invoices=${sp.invoices}`,
  );

  const pr = await seedPrivacy(org.id);
  console.log(
    `[seed] dsars=${pr.dsar} data_locations=${pr.locations} consents=${pr.consents} ropas=${pr.ropas} incidents=${pr.incidents}`,
  );

  const ru = await seedRolesAndTestUsers(org.id);
  console.log(
    `[seed] roles=${ru.rolesWritten} test_users=${ru.usersWritten}`,
  );

  console.log("[seed] done.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[seed] failed:", err);
    return prisma.$disconnect().finally(() => process.exit(1));
  });

// ───────────────────────────────────────────────────────────────────
// Section 4 — Intake tickets
// ───────────────────────────────────────────────────────────────────
//
// Reads the existing v8 demo fixtures from modules/intake/src/seed at
// runtime and translates them to IntakeTicket + AgentRecommendation
// + IntakeConversation rows. Single source of truth for demo data.
//
// See CLAUDE.md "Documented exceptions" — the cross-package import
// below is a deliberate, narrowly-scoped exception for dev tooling.

type V8Ticket = {
  id: string;
  _source?: string;
  _ageHours?: number;
  from: string;
  dept: string;
  type: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  status: string;
  stage: string;
  desc: string;
  assigned: string;
  sla: string;
  slaHours: number;
  slaStatus: "On Track" | "At Risk" | "Breached" | "Overdue";
  workflow: Array<{ label: string; done?: boolean; active?: boolean }>;
  aiTriage?: Record<string, unknown>;
  agentRecommendation?: {
    agentId: string;
    confidence: number;
    suggestedAction: string;
    draftedResponse: string;
    reasoning: string;
    concerns?: string[];
    precedentLinks?: Array<{ id: string; title: string }>;
    alternativeTone?: string | null;
  };
  conversation?: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    ts?: number;
    fieldsExtracted?: Record<string, unknown>;
  }>;
  triagedBy?: string | null;
  triagedAt?: number | null;
  triagedAction?: string | null;
};

async function loadV8Seeds(): Promise<V8Ticket[]> {
  // eslint-disable-next-line import/no-restricted-paths -- Dev-only seed import. Architectural rule prohibits modules ↔ packages coupling at RUNTIME; this is a build-time seed script reading its own input. Do not use this pattern for runtime code.
  const v72 = await import("../../../modules/intake/src/seed/v72-seed.js");
  // eslint-disable-next-line import/no-restricted-paths -- Dev-only seed import. Architectural rule prohibits modules ↔ packages coupling at RUNTIME; this is a build-time seed script reading its own input. Do not use this pattern for runtime code.
  const cockpit = await import("../../../modules/intake/src/seed/v8-cockpit-seed.js");
  // eslint-disable-next-line import/no-restricted-paths -- Dev-only seed import. Architectural rule prohibits modules ↔ packages coupling at RUNTIME; this is a build-time seed script reading its own input. Do not use this pattern for runtime code.
  const bulk = await import("../../../modules/intake/src/seed/v8-bulk-nda-seed.js");
  return [
    ...((v72 as { V72_SEED: V8Ticket[] }).V72_SEED ?? []),
    ...((cockpit as { V8_COCKPIT_SEED: V8Ticket[] }).V8_COCKPIT_SEED ?? []),
    ...((bulk as { V8_BULK_NDA_SEED: V8Ticket[] }).V8_BULK_NDA_SEED ?? []),
  ];
}

const REQUESTER_BY_NAME: Record<string, string> = Object.fromEntries(
  REQUESTERS.map((r) => [r.name, r.id]),
);

function mapStatus(raw: string): IntakeStatus {
  const s = raw.toLowerCase();
  if (s.includes("escalat")) return IntakeStatus.ESCALATED;
  if (s.includes("approve")) return IntakeStatus.APPROVED;
  if (s.includes("reject")) return IntakeStatus.REJECTED;
  if (s.includes("complete") || s.includes("auto")) return IntakeStatus.CLOSED;
  if (s.includes("review") || s.includes("assigned")) return IntakeStatus.IN_REVIEW;
  return IntakeStatus.AWAITING_TRIAGE;
}

function mapSource(raw: string | undefined): IntakeSource {
  if (raw === "copilot") return IntakeSource.COPILOT;
  if (raw === "email") return IntakeSource.EMAIL;
  if (raw === "slack") return IntakeSource.SLACK;
  if (raw === "api") return IntakeSource.API;
  return IntakeSource.FORM; // form, seed, or undefined → FORM
}

function mapConversationRole(raw: string): ConversationRole {
  if (raw === "user") return ConversationRole.USER;
  if (raw === "system") return ConversationRole.SYSTEM;
  return ConversationRole.ASSISTANT;
}

// Some tickets (REQ-3506, 3503, 3403) link to matters seeded in §3.
const TICKET_TO_MATTER: Record<string, string> = {
  "REQ-3506": "m-snowflake-msa",
  "REQ-3503": "m-saigon-vendor",
  "REQ-3403": "m-emp-harassment",
};

async function ensureRequesterPerson(
  orgId: string,
  name: string,
  dept: string,
): Promise<string> {
  const known = REQUESTER_BY_NAME[name];
  if (known) return known;
  // v72 includes a few names not in the pre-seeded REQUESTERS list.
  // Auto-create with a deterministic id so re-runs upsert the same row.
  const id = "p-auto-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  await prisma.person.upsert({
    where: { id },
    update: { name, metadata: { department: dept, autoCreatedBySeed: true } },
    create: {
      id,
      organizationId: orgId,
      type: PersonType.EMPLOYEE,
      externalRef: "employee:" + id,
      name,
      email: id + "@aegis-demo.example",
      metadata: { department: dept, autoCreatedBySeed: true },
    },
  });
  return id;
}

async function seedTickets(orgId: string) {
  const tickets = await loadV8Seeds();
  let recCount = 0;
  let convCount = 0;
  let autoPersonCount = 0;

  for (const t of tickets) {
    // Resolve requester (auto-create unknown v72 names).
    const beforePersonCount = await prisma.person.count({
      where: { id: { startsWith: "p-auto-" } },
    });
    const requesterId = await ensureRequesterPerson(orgId, t.from, t.dept);
    const afterPersonCount = await prisma.person.count({
      where: { id: { startsWith: "p-auto-" } },
    });
    if (afterPersonCount > beforePersonCount) autoPersonCount++;

    const submittedAt = new Date(
      Date.now() - (t._ageHours ?? 1) * 3600 * 1000,
    );
    const matterId = TICKET_TO_MATTER[t.id] ?? null;

    await prisma.intakeTicket.upsert({
      where: { id: t.id },
      update: {
        type: t.type,
        priority: t.priority,
        status: mapStatus(t.status),
        stage: t.stage,
        description: t.desc,
        slaHours: t.slaHours,
        slaStatus: t.slaStatus,
        aiTriageJson: (t.aiTriage ?? null) as never,
        workflowJson: (t.workflow ?? []) as never,
        triagedBy: t.triagedBy ?? null,
        triagedAt: t.triagedAt ? new Date(t.triagedAt) : null,
        triagedAction: t.triagedAction ?? null,
      },
      create: {
        id: t.id,
        organizationId: orgId,
        requesterId,
        matterId,
        source: mapSource(t._source),
        type: t.type,
        priority: t.priority,
        status: mapStatus(t.status),
        stage: t.stage,
        description: t.desc,
        department: t.dept,
        assignedTo: t.assigned,
        slaHours: t.slaHours,
        slaStatus: t.slaStatus,
        aiTriageJson: (t.aiTriage ?? null) as never,
        workflowJson: (t.workflow ?? []) as never,
        submittedAt,
        triagedBy: t.triagedBy ?? null,
        triagedAt: t.triagedAt ? new Date(t.triagedAt) : null,
        triagedAction: t.triagedAction ?? null,
      },
    });

    // Idempotent rec/conversation: replace on every seed run. The
    // ticket itself is upserted; only its dependent rows churn.
    await prisma.agentRecommendation.deleteMany({ where: { ticketId: t.id } });
    if (t.agentRecommendation) {
      const r = t.agentRecommendation;
      await prisma.agentRecommendation.create({
        data: {
          ticketId: t.id,
          agentId: r.agentId,
          confidence: r.confidence,
          suggestedAction: r.suggestedAction,
          draftedResponse: r.draftedResponse,
          reasoning: r.reasoning,
          concerns: (r.concerns ?? []) as never,
          citations: (r.precedentLinks ?? []) as never,
          shortFormReply: r.alternativeTone ?? null,
          status: AgentRecommendationStatus.PENDING,
        },
      });
      recCount++;
    }

    await prisma.intakeConversation.deleteMany({ where: { ticketId: t.id } });
    if (Array.isArray(t.conversation)) {
      for (const m of t.conversation) {
        await prisma.intakeConversation.create({
          data: {
            ticketId: t.id,
            role: mapConversationRole(m.role),
            content: m.content,
            fieldsExtracted: (m.fieldsExtracted ?? null) as never,
            timestamp: new Date(m.ts ?? Date.now()),
          },
        });
        convCount++;
      }
    }
  }

  return { ticketCount: tickets.length, recCount, convCount, autoPersonCount };
}

// ───────────────────────────────────────────────────────────────────
// Section 5 — Spend & Counsel
// ───────────────────────────────────────────────────────────────────
//
// Two outside-counsel firms (LAW_FIRM Vendors backed by Counterparty
// rows) plus an alternative legal services provider. Six invoices
// across the open Snowflake matter — three approved/paid, two in
// review, one flagged for an anomaly. One annual department budget
// + one matter-scoped budget exercise both BudgetScope variants.

async function seedSpend(orgId: string) {
  // Counterparties for law firms — the spine connects Vendor.counterpartyId
  // to a real Counterparty row, so cross-module queries (matter-vendor,
  // contracts-vendor) all resolve through one shared entity.
  await prisma.counterparty.upsert({
    where: { id: "cp-skadden" },
    update: { name: "Skadden, Arps, Slate, Meagher & Flom LLP" },
    create: {
      id: "cp-skadden",
      organizationId: orgId,
      name: "Skadden, Arps, Slate, Meagher & Flom LLP",
      type: CounterpartyType.LAW_FIRM,
      country: "US",
    },
  });
  await prisma.counterparty.upsert({
    where: { id: "cp-cleary" },
    update: { name: "Cleary Gottlieb Steen & Hamilton LLP" },
    create: {
      id: "cp-cleary",
      organizationId: orgId,
      name: "Cleary Gottlieb Steen & Hamilton LLP",
      type: CounterpartyType.LAW_FIRM,
      country: "US",
    },
  });
  await prisma.counterparty.upsert({
    where: { id: "cp-axiom" },
    update: { name: "Axiom Law" },
    create: {
      id: "cp-axiom",
      organizationId: orgId,
      name: "Axiom Law",
      type: CounterpartyType.LAW_FIRM,
      country: "US",
    },
  });

  // Vendors
  const skadden = await prisma.vendor.upsert({
    where: { id: "v-skadden" },
    update: {},
    create: {
      id: "v-skadden",
      organizationId: orgId,
      name: "Skadden",
      type: "LAW_FIRM",
      counterpartyId: "cp-skadden",
      ratesCard: { partner: 1450, senior: 1100, associate: 750 },
      performanceScore: 4.3,
    },
  });
  const cleary = await prisma.vendor.upsert({
    where: { id: "v-cleary" },
    update: {},
    create: {
      id: "v-cleary",
      organizationId: orgId,
      name: "Cleary Gottlieb",
      type: "LAW_FIRM",
      counterpartyId: "cp-cleary",
      ratesCard: { partner: 1500, senior: 1150, associate: 800 },
      performanceScore: 4.5,
    },
  });
  const axiom = await prisma.vendor.upsert({
    where: { id: "v-axiom" },
    update: {},
    create: {
      id: "v-axiom",
      organizationId: orgId,
      name: "Axiom Law",
      type: "ALSP",
      counterpartyId: "cp-axiom",
      ratesCard: { senior_attorney: 425, attorney: 285 },
      performanceScore: 4.0,
    },
  });

  // Timekeepers — external counsel Persons (separate from EMPLOYEE
  // requesters). They link to Vendor + Person.
  const tkPersons = [
    { id: "p-tk-skadden-partner", name: "Margaret Holloway", title: "Partner", vendor: skadden.id, defaultRate: 1450 },
    { id: "p-tk-skadden-senior",  name: "Theodore Park",     title: "Senior Associate", vendor: skadden.id, defaultRate: 1100 },
    { id: "p-tk-cleary-partner",  name: "Yvonne Chen",       title: "Partner", vendor: cleary.id,  defaultRate: 1500 },
    { id: "p-tk-axiom-senior",    name: "Daniel Reyes",      title: "Senior Attorney", vendor: axiom.id,   defaultRate: 425 },
  ];
  for (const t of tkPersons) {
    await prisma.person.upsert({
      where: { id: t.id },
      update: { name: t.name },
      create: {
        id: t.id,
        organizationId: orgId,
        type: PersonType.EXTERNAL_COUNSEL,
        externalRef: "timekeeper:" + t.id,
        name: t.name,
        email: t.id + "@external.example",
        metadata: { vendor: t.vendor, title: t.title },
      },
    });
    await prisma.timekeeper.upsert({
      where: { vendorId_personId: { vendorId: t.vendor, personId: t.id } },
      update: { defaultRate: t.defaultRate, title: t.title },
      create: {
        vendorId: t.vendor,
        personId: t.id,
        title: t.title,
        defaultRate: t.defaultRate,
      },
    });
  }

  // Six invoices across the Snowflake matter.
  const invoices: Array<{
    id: string;
    vendorId: string;
    matterId: string;
    amount: number;
    periodStart: Date;
    periodEnd: Date;
    status: "SUBMITTED" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "PAID";
    flagAnomaly?: boolean;
  }> = [
    { id: "inv-snowflake-001", vendorId: skadden.id, matterId: "m-snowflake-msa", amount: 48_750, periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-01-31"), status: "PAID" },
    { id: "inv-snowflake-002", vendorId: skadden.id, matterId: "m-snowflake-msa", amount: 62_300, periodStart: new Date("2026-02-01"), periodEnd: new Date("2026-02-28"), status: "PAID" },
    { id: "inv-snowflake-003", vendorId: skadden.id, matterId: "m-snowflake-msa", amount: 71_400, periodStart: new Date("2026-03-01"), periodEnd: new Date("2026-03-31"), status: "APPROVED" },
    { id: "inv-snowflake-004", vendorId: cleary.id,  matterId: "m-snowflake-msa", amount: 28_900, periodStart: new Date("2026-03-01"), periodEnd: new Date("2026-03-31"), status: "IN_REVIEW" },
    { id: "inv-snowflake-005", vendorId: skadden.id, matterId: "m-snowflake-msa", amount: 94_200, periodStart: new Date("2026-04-01"), periodEnd: new Date("2026-04-15"), status: "IN_REVIEW", flagAnomaly: true },
    { id: "inv-snowflake-006", vendorId: axiom.id,   matterId: "m-snowflake-msa", amount: 12_400, periodStart: new Date("2026-04-01"), periodEnd: new Date("2026-04-15"), status: "SUBMITTED" },
  ];

  for (const inv of invoices) {
    await prisma.invoice.upsert({
      where: { id: inv.id },
      update: { status: inv.status as never },
      create: {
        id: inv.id,
        vendorId: inv.vendorId,
        matterId: inv.matterId,
        amount: inv.amount,
        currency: "USD",
        periodStart: inv.periodStart,
        periodEnd: inv.periodEnd,
        status: inv.status as never,
        ledesData: null as never,
        approvedBy: inv.status === "APPROVED" || inv.status === "PAID" ? "demo-person-alex" : null,
        approvedAt: inv.status === "APPROVED" || inv.status === "PAID" ? new Date(inv.periodEnd.getTime() + 5 * 24 * 60 * 60 * 1000) : null,
      },
    });
    // Replace line items idempotently.
    await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: inv.id } });
    // Two lines per invoice — partner + senior associate, simple split.
    const partnerHours = Math.round((inv.amount * 0.4) / 1450);
    const seniorHours = Math.round((inv.amount * 0.6) / 1100);
    const partnerTk =
      inv.vendorId === skadden.id ? "p-tk-skadden-partner" :
      inv.vendorId === cleary.id ? "p-tk-cleary-partner" :
      "p-tk-axiom-senior";
    const seniorTk =
      inv.vendorId === skadden.id ? "p-tk-skadden-senior" : partnerTk;
    await prisma.invoiceLineItem.create({
      data: {
        invoiceId: inv.id,
        timekeeperId: partnerTk,
        hours: partnerHours,
        rate: 1450,
        description: "Snowflake MSA — partner-level review and counterparty negotiation",
        date: inv.periodStart,
        status: inv.flagAnomaly ? "FLAGGED" : ("ACCEPTED" as never),
        flaggedReason: inv.flagAnomaly ? "Block-billed; line item exceeds standard 8-hour daily cap" : null,
      },
    });
    await prisma.invoiceLineItem.create({
      data: {
        invoiceId: inv.id,
        timekeeperId: seniorTk,
        hours: seniorHours,
        rate: 1100,
        description: "Snowflake MSA — drafting + redline turn",
        date: inv.periodStart,
        status: "ACCEPTED" as never,
      },
    });
  }

  // Budgets — one matter-scoped, one annual-scoped.
  await prisma.budget.upsert({
    where: {
      organizationId_scope_scopeId_period: {
        organizationId: orgId,
        scope: "MATTER",
        scopeId: "m-snowflake-msa",
        period: "2026",
      },
    },
    update: { allocatedAmount: 350_000, spentAmount: 318_000 },
    create: {
      organizationId: orgId,
      scope: "MATTER",
      scopeId: "m-snowflake-msa",
      period: "2026",
      allocatedAmount: 350_000,
      spentAmount: 318_000,
    },
  });
  await prisma.budget.upsert({
    where: {
      organizationId_scope_scopeId_period: {
        organizationId: orgId,
        scope: "ANNUAL",
        scopeId: "legal-2026",
        period: "2026",
      },
    },
    update: { allocatedAmount: 4_500_000, spentAmount: 1_847_000 },
    create: {
      organizationId: orgId,
      scope: "ANNUAL",
      scopeId: "legal-2026",
      period: "2026",
      allocatedAmount: 4_500_000,
      spentAmount: 1_847_000,
    },
  });

  return { vendors: 3, timekeepers: tkPersons.length, invoices: invoices.length };
}

// ───────────────────────────────────────────────────────────────────
// Section 6 — Privacy & Compliance Operations
// ───────────────────────────────────────────────────────────────────
//
// Sample DSAR + DSARDataLocation rows + ConsentRecord +
// DataProcessingActivity (ROPA) + a low-severity PrivacyIncident.
// The DSAR requester is a DATA_SUBJECT Person, separate from any
// employee record they might also hold (identity resolution is
// @aegis/identity-graph's job, Step 7+).

async function seedPrivacy(orgId: string) {
  const dataSubject = await prisma.person.upsert({
    where: { id: "p-ds-jdoe" },
    update: { name: "J. Doe" },
    create: {
      id: "p-ds-jdoe",
      organizationId: orgId,
      type: PersonType.DATA_SUBJECT,
      externalRef: "data-subject:jdoe-001",
      name: "J. Doe",
      email: "jdoe@external.example",
      metadata: {
        verificationDoc: "passport",
        jurisdiction: "EU",
      },
    },
  });

  // DSAR — access request, in progress.
  const dsar = await prisma.dataSubjectRequest.upsert({
    where: { id: "dsar-2026-001" },
    update: { status: "IN_PROGRESS" },
    create: {
      id: "dsar-2026-001",
      organizationId: orgId,
      requesterPersonId: dataSubject.id,
      requestType: "ACCESS",
      jurisdiction: "EU",
      status: "IN_PROGRESS",
      slaDeadline: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000),
      verificationStatus: "VERIFIED",
    },
  });

  // Data location lookups across systems — found in two, not in one.
  const locations = [
    { system: "Salesforce CRM", dataType: "contact-info", found: true,  redactionsRequired: true,  retrieved: true  },
    { system: "Marketing-DB",   dataType: "email-events",  found: true,  redactionsRequired: false, retrieved: false },
    { system: "HRIS",           dataType: "employment",    found: false, redactionsRequired: false, retrieved: false },
  ];
  for (const l of locations) {
    await prisma.dSARDataLocation.upsert({
      where: {
        requestId_system_dataType: {
          requestId: dsar.id,
          system: l.system,
          dataType: l.dataType,
        },
      },
      update: { found: l.found },
      create: {
        requestId: dsar.id,
        system: l.system,
        dataType: l.dataType,
        found: l.found,
        redactionsRequired: l.redactionsRequired,
        retrievedAt: l.retrieved ? new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) : null,
      },
    });
  }

  // Consent record — opt-in with EXPLICIT mechanism.
  await prisma.consentRecord.upsert({
    where: { id: "cr-jdoe-marketing" },
    update: {},
    create: {
      id: "cr-jdoe-marketing",
      organizationId: orgId,
      dataSubjectPersonId: dataSubject.id,
      purpose: "Marketing communications — product newsletter",
      mechanism: "EXPLICIT",
      capturedAt: new Date("2026-01-15T10:00:00Z"),
    },
  });

  // ROPA — Record of Processing Activities. Two entries cover the
  // dataProcessor counterparties seeded in §2 (Saigon Tech Labs,
  // DataStream AI).
  await prisma.dataProcessingActivity.upsert({
    where: {
      organizationId_name: { organizationId: orgId, name: "Customer support analytics" },
    },
    update: {},
    create: {
      organizationId: orgId,
      name: "Customer support analytics",
      lawfulBasis: "Legitimate interest (recital 47)",
      dataTypes: ["support-ticket", "anonymised-usage-events"],
      retentionPeriodDays: 365,
      dataSubjectCategories: ["customers", "trial-users"],
      systems: ["Zendesk", "Saigon Tech Labs analytics"],
      transferredCountries: ["VN"],
    },
  });
  await prisma.dataProcessingActivity.upsert({
    where: {
      organizationId_name: { organizationId: orgId, name: "ML model training (anonymised)" },
    },
    update: {},
    create: {
      organizationId: orgId,
      name: "ML model training (anonymised)",
      lawfulBasis: "Contract (Article 6(1)(b))",
      dataTypes: ["anonymised-product-events"],
      retentionPeriodDays: 730,
      dataSubjectCategories: ["customers"],
      systems: ["DataStream AI"],
      transferredCountries: ["US"],
    },
  });

  // Sample low-severity privacy incident — discovered, contained,
  // not escalated to regulator.
  await prisma.privacyIncident.upsert({
    where: { id: "pi-2026-001" },
    update: { status: "CONTAINED" },
    create: {
      id: "pi-2026-001",
      organizationId: orgId,
      severity: "LOW",
      discoveredAt: new Date("2026-04-10T14:22:00Z"),
      reportedAt: new Date("2026-04-10T16:00:00Z"),
      affectedRecordsCount: 12,
      status: "CONTAINED",
      regulatorNotified: false,
      mitigationSteps: [
        "Misrouted email to internal distribution list — recall sent within 18 minutes",
        "Confirmed no external recipients via mail-server logs",
        "Privacy Impact Assessment recorded; no regulator threshold met",
      ],
      description: "12 internal records included in an internal-only mail by mistake. No external exposure.",
    },
  });

  return { dsar: 1, locations: locations.length, consents: 1, ropas: 2, incidents: 1 };
}

// ───────────────────────────────────────────────────────────────────
// Section 7 — Roles + test users
// ───────────────────────────────────────────────────────────────────
//
// Writes all 8 canonical Roles with their full permission sets from
// @aegis/auth.ROLE_PERMISSIONS, and creates one test user per non-admin
// role so local dev can preview the demo through different role lenses
// by setting DEV_USER_EMAIL=<role>.test@aegis-demo.example.
//
// Idempotent: every Role is upserted by (organizationId, name); every
// User is upserted by (organizationId, email). Re-running this section
// against the Step 2 data refreshes the admin permission JSON from
// 20 strings (Step 2's literal list) → 37 strings (the canonical
// superset), and brings the other 7 roles into existence with their
// default permission bundles. Step 2 data is preserved.
//
// admin → Alex Nguyen (existing, from §1)
// gc, attorney, paralegal, legal_ops, requester, external_counsel, viewer
//   → seven new test users, one each.

const TEST_USERS: ReadonlyArray<{
  email: string;
  name: string;
  roleName: Exclude<RoleName, "admin">;
}> = Object.freeze([
  { email: "marcus.gc@aegis-demo.example",          name: "Marcus Reyes",      roleName: "gc" },
  { email: "alex.nguyen@aegis-demo.example",         name: "Alex Nguyen",       roleName: "admin" as never } as never, // sentinel; filtered below
  { email: "lena.attorney@aegis-demo.example",       name: "Lena Pérez",        roleName: "attorney" },
  { email: "samira.paralegal@aegis-demo.example",    name: "Samira Iqbal",      roleName: "paralegal" },
  { email: "thomas.legalops@aegis-demo.example",     name: "Thomas Berger",     roleName: "legal_ops" },
  { email: "alexkim.requester@aegis-demo.example",   name: "Alex Kim",          roleName: "requester" },
  { email: "rebecca.external@aegis-demo.example",    name: "Rebecca Sato",      roleName: "external_counsel" },
  { email: "felix.viewer@aegis-demo.example",        name: "Felix Brennan",     roleName: "viewer" },
].filter((u) => u.roleName !== ("admin" as never)));

async function seedRolesAndTestUsers(orgId: string) {
  // 1. Upsert every canonical role with the full ROLE_PERMISSIONS list.
  //    For admin this overwrites Step 2's 20-string seed with the
  //    canonical 37-string superset.
  let rolesWritten = 0;
  for (const roleName of ALL_ROLES) {
    const permissions = Array.from(ROLE_PERMISSIONS[roleName]);
    await prisma.role.upsert({
      where: {
        organizationId_name: { organizationId: orgId, name: roleName },
      },
      update: { permissions },
      create: {
        organizationId: orgId,
        name: roleName,
        permissions,
      },
    });
    rolesWritten += 1;
  }

  // 2. Resolve the role rows so we can attach test users to them.
  const roleRows = await prisma.role.findMany({
    where: { organizationId: orgId },
  });
  const roleIdByName = new Map(roleRows.map((r) => [r.name, r.id]));

  // 3. Upsert one test user per non-admin role (admin is Alex, already
  //    seeded in §1). Each user gets a deterministic email so
  //    DEV_USER_EMAIL=<email> can preview the demo as that role.
  let usersWritten = 0;
  for (const u of TEST_USERS) {
    const roleId = roleIdByName.get(u.roleName);
    if (!roleId) continue;
    await prisma.user.upsert({
      where: {
        organizationId_email: { organizationId: orgId, email: u.email },
      },
      update: { name: u.name, roleId },
      create: {
        organizationId: orgId,
        email: u.email,
        name: u.name,
        roleId,
      },
    });
    usersWritten += 1;
  }

  return { rolesWritten, usersWritten };
}
