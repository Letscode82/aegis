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
} from "@prisma/client";

const prisma = new PrismaClient();

// ───────────────────────────────────────────────────────────────────
// Constants — known external refs make the seed re-runnable.
// ───────────────────────────────────────────────────────────────────

const DEMO_ORG_NAME = "AEGIS Demo Corp";
const DEMO_USER_EMAIL = "alex.nguyen@aegis-demo.example";
const DEMO_USER_NAME = "Alex Nguyen";

// All canonical permission strings. Step 3 will move this list to
// @aegis/auth and trim per-role; the demo admin gets all of them today.
const ALL_PERMISSIONS = [
  "intake:create_ticket",
  "intake:read_all_tickets",
  "intake:approve_recommendation",
  "intake:reject_recommendation",
  "intake:close_ticket",
  "matter:read_all",
  "matter:create",
  "matter:update",
  "matter:close",
  "matter:legal_hold:issue",
  "matter:legal_hold:release",
  "matter:legal_hold:custodian_view",
  "spend:read_all",
  "spend:approve_invoice",
  "spend:reject_invoice",
  "privacy:dsar:read",
  "privacy:dsar:fulfill",
  "audit:read_all",
  "admin:manage_users",
  "admin:manage_roles",
];

// ───────────────────────────────────────────────────────────────────
// Section 1 — Organization, Role, User, Alex Nguyen Person
// ───────────────────────────────────────────────────────────────────

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

  const adminRole = await prisma.role.upsert({
    where: {
      organizationId_name: { organizationId: org.id, name: "admin" },
    },
    update: { permissions: ALL_PERMISSIONS },
    create: {
      organizationId: org.id,
      name: "admin",
      permissions: ALL_PERMISSIONS,
    },
  });

  const user = await prisma.user.upsert({
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

  console.log("[seed] done.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[seed] failed:", err);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
