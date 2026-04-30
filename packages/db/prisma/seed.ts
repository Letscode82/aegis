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

import { PrismaClient, PersonType } from "@prisma/client";

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
// Entry point
// ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("[seed] starting…");

  const { org, user, alexPerson } = await seedOrgAndAdmin();
  console.log(`[seed] org=${org.id} user=${user.id} alex=${alexPerson.id}`);

  console.log("[seed] done.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[seed] failed:", err);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
