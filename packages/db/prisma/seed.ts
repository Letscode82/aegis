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

  console.log("[seed] done.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[seed] failed:", err);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
