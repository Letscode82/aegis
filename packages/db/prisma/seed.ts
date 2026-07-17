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
  DataSourceType,
  PreservationAction,
  IntakeSource,
  IntakeStatus,
  AgentRecommendationStatus,
  ConversationRole,
  ContractStatus,
  ContractRisk,
  ObligationSourceType,
  ObligationStatus,
} from "@prisma/client";
import { createHash } from "node:crypto";
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

/**
 * Admin display name — env-driven so production deploys carry the
 * real admin's name rather than the "Alex Nguyen" demo persona.
 * Mirrors the SEED_ADMIN_EMAIL parametrization below. Without this,
 * audit-log displays, the Cockpit attorney header, and every
 * `actorId → User.name` join show "Alex Nguyen" even when the admin
 * is logged in via Auth0 as someone else.
 *
 * The default ("Alex Nguyen") preserves back-compat for local dev /
 * CI and for existing deployments that haven't set the env var.
 *
 * Idempotency: the seed below tolerates the **legacy** "Alex Nguyen"
 * name on existing rows — if SEED_ADMIN_NAME is set to e.g. "Rachel
 * Adams", the next seed run finds the pre-existing row by either the
 * legacy name OR the configured email and rewrites both `name` and
 * `email` to converge on the new values.
 */
const LEGACY_DEMO_USER_NAME = "Alex Nguyen";
const DEMO_USER_NAME =
  (process.env.SEED_ADMIN_NAME ?? "").trim() || LEGACY_DEMO_USER_NAME;

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
 * Idempotency: see DEMO_USER_NAME above — the admin lookup is
 * resilient to both legacy-name rows and post-rename rows.
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

  // Identify the admin User within the demo org, tolerant of three
  // states the row could be in:
  //   1. Already renamed (name === DEMO_USER_NAME for current run).
  //   2. Pre-rename — the legacy "Alex Nguyen" name from a prior run
  //      before SEED_ADMIN_NAME was set / changed.
  //   3. Created via Auth0 first-login path with the right email but
  //      no admin name yet (defensive — unusual in practice).
  // Each match converges on the same row by `id`; the update then
  // rewrites name + email to the current env values, so re-running
  // with new env vars is fully idempotent and migrates in place.
  const existingAdmin = await prisma.user.findFirst({
    where: {
      organizationId: org.id,
      OR: [
        { name: DEMO_USER_NAME },
        { name: LEGACY_DEMO_USER_NAME },
        { email: DEMO_USER_EMAIL },
      ],
    },
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

// ── 3a. Matter type configuration ────────────────────────────────
//
// Per-(organisation, matter type) configuration: numbering format,
// closeout checklist, default folder structure. Reads from this
// table seed module behaviour (number assignment, folder auto-create
// on M365 binding, closeout gating).

const TYPE_CONFIGS: Array<{
  matterType: MatterType;
  numberingFormat: string;
  defaultFolderStructure: string[];
  closeoutChecklist: Array<{ key: string; label: string; required: boolean }>;
  documentTemplates: Array<{ key: string; name: string }>;
}> = [
  {
    matterType: MatterType.LITIGATION,
    numberingFormat: "M-LIT-{YYYY}-{SEQ:4}",
    defaultFolderStructure: [
      "Pleadings",
      "Motions",
      "Discovery",
      "Correspondence",
      "Settlement",
    ],
    closeoutChecklist: [
      { key: "final-judgment", label: "Final judgment / settlement on file", required: true },
      { key: "preservation-released", label: "Preservation orders released", required: true },
      { key: "fees-reconciled", label: "Outside-counsel fees reconciled", required: true },
      { key: "knowledge-entry", label: "Lessons-learned added to Knowledge", required: false },
    ],
    documentTemplates: [
      { key: "complaint", name: "Complaint" },
      { key: "answer", name: "Answer" },
      { key: "discovery-request", name: "Discovery Request" },
    ],
  },
  {
    matterType: MatterType.TRANSACTIONAL,
    numberingFormat: "M-TXN-{YYYY}-{SEQ:4}",
    defaultFolderStructure: [
      "Drafts",
      "Redlines",
      "Counterparty Comms",
      "Executed",
    ],
    closeoutChecklist: [
      { key: "executed-on-file", label: "Executed contract on file", required: true },
      { key: "obligations-extracted", label: "Obligations extracted to Obligation tracker", required: true },
      { key: "renewal-flagged", label: "Renewal date flagged on calendar", required: false },
    ],
    documentTemplates: [
      { key: "msa", name: "Master Services Agreement" },
      { key: "sow", name: "Statement of Work" },
    ],
  },
  {
    matterType: MatterType.MA,
    numberingFormat: "M-MA-{YYYY}-{SEQ:4}",
    defaultFolderStructure: [
      "Diligence",
      "Definitive Agreements",
      "Disclosure Schedules",
      "Closing",
      "Post-Closing",
    ],
    closeoutChecklist: [
      { key: "definitive-signed", label: "Definitive agreement signed", required: true },
      { key: "regulatory-clearances", label: "Regulatory clearances received", required: true },
      { key: "post-closing-deliverables", label: "Post-closing deliverables filed", required: true },
    ],
    documentTemplates: [
      { key: "loi", name: "Letter of Intent" },
      { key: "spa", name: "Stock Purchase Agreement" },
    ],
  },
  {
    matterType: MatterType.IP,
    numberingFormat: "M-IP-{YYYY}-{SEQ:4}",
    defaultFolderStructure: ["Filings", "Office Actions", "Prior Art"],
    closeoutChecklist: [
      { key: "registration-confirmed", label: "Registration / disposition confirmed", required: true },
      { key: "renewal-calendared", label: "Renewal calendared", required: false },
    ],
    documentTemplates: [{ key: "patent-app", name: "Patent Application" }],
  },
  {
    matterType: MatterType.EMPLOYMENT,
    numberingFormat: "M-EMP-{YYYY}-{SEQ:4}",
    defaultFolderStructure: ["Investigation", "External Counsel", "HR", "Outcome"],
    closeoutChecklist: [
      { key: "investigation-report", label: "Investigation report finalised", required: true },
      { key: "hr-action-recorded", label: "HR action recorded", required: true },
      { key: "hold-released", label: "Legal hold released", required: true },
    ],
    documentTemplates: [
      { key: "investigation-plan", name: "Investigation Plan" },
    ],
  },
  {
    matterType: MatterType.REGULATORY,
    numberingFormat: "M-REG-{YYYY}-{SEQ:4}",
    defaultFolderStructure: ["Filings", "Comments", "Correspondence"],
    closeoutChecklist: [
      { key: "filing-submitted", label: "Required filings submitted", required: true },
    ],
    documentTemplates: [],
  },
  {
    matterType: MatterType.INVESTIGATION,
    numberingFormat: "M-INV-{YYYY}-{SEQ:4}",
    defaultFolderStructure: ["Evidence", "Witness Statements", "Findings"],
    closeoutChecklist: [
      { key: "findings-finalised", label: "Findings finalised", required: true },
      { key: "remediation-tracked", label: "Remediation actions tracked", required: true },
    ],
    documentTemplates: [],
  },
  {
    matterType: MatterType.ADVISORY,
    numberingFormat: "M-ADV-{YYYY}-{SEQ:4}",
    defaultFolderStructure: ["Memos", "Opinions"],
    closeoutChecklist: [
      { key: "memo-finalised", label: "Advisory memo finalised", required: true },
    ],
    documentTemplates: [{ key: "advisory-memo", name: "Advisory Memo" }],
  },
  {
    matterType: MatterType.OTHER,
    numberingFormat: "M-{YYYY}-{SEQ:4}",
    defaultFolderStructure: ["General"],
    closeoutChecklist: [],
    documentTemplates: [],
  },
];

async function seedMatterTypeConfigs(orgId: string) {
  for (const c of TYPE_CONFIGS) {
    await prisma.matterTypeConfig.upsert({
      where: {
        organizationId_matterType: {
          organizationId: orgId,
          matterType: c.matterType,
        },
      },
      update: {
        numberingFormat: c.numberingFormat,
        defaultFolderStructure: c.defaultFolderStructure,
        closeoutChecklist: c.closeoutChecklist,
        documentTemplates: c.documentTemplates,
      },
      create: {
        organizationId: orgId,
        matterType: c.matterType,
        numberingFormat: c.numberingFormat,
        defaultFolderStructure: c.defaultFolderStructure,
        closeoutChecklist: c.closeoutChecklist,
        documentTemplates: c.documentTemplates,
      },
    });
  }
  return TYPE_CONFIGS.length;
}

function checklistSnapshot(
  matterType: MatterType,
): Array<{ key: string; label: string; required: boolean; completed: boolean }> {
  const config = TYPE_CONFIGS.find((c) => c.matterType === matterType);
  return (config?.closeoutChecklist ?? []).map((it) => ({
    key: it.key,
    label: it.label,
    required: it.required,
    completed: false,
  }));
}

async function seedMatters(orgId: string, leadAttorneyPersonId: string) {
  // Snowflake MSA
  await prisma.matter.upsert({
    where: { id: "m-snowflake-msa" },
    update: {
      title: "Snowflake MSA — Renewal & Re-papering",
      matterNumber: "M-TXN-2026-0001",
      jurisdiction: "US-CA",
      estimatedValue: 2_400_000,
      estimatedDurationDays: 90,
      closeoutChecklistJson: checklistSnapshot(MatterType.TRANSACTIONAL),
    },
    create: {
      id: "m-snowflake-msa",
      organizationId: orgId,
      title: "Snowflake MSA — Renewal & Re-papering",
      matterNumber: "M-TXN-2026-0001",
      type: MatterType.TRANSACTIONAL,
      status: MatterStatus.OPEN,
      jurisdiction: "US-CA",
      estimatedValue: 2_400_000,
      estimatedDurationDays: 90,
      leadAttorneyId: leadAttorneyPersonId,
      counterpartyId: "cp-snowflake",
      description:
        "Re-papering of master services agreement. Engineering negotiating payment terms (counterparty proposed Net 30 vs our Net 45 playbook). IP § 8.2 ambiguous — flagged for IP team.",
      closeoutChecklistJson: checklistSnapshot(MatterType.TRANSACTIONAL),
      metadata: { exposure: "$2.4M annual", playbook: "MSA-v2" },
    },
  });

  // Saigon Tech Labs vendor onboarding (closed)
  await prisma.matter.upsert({
    where: { id: "m-saigon-vendor" },
    update: {
      title: "Saigon Tech Labs — Vendor Onboarding",
      matterNumber: "M-ADV-2026-0001",
      jurisdiction: "US-CA",
      estimatedValue: 180_000,
      // For a closed matter, mark every required checklist item complete so
      // the Step 4a state-machine assertion (closeout-gated) holds in seed.
      closeoutChecklistJson: checklistSnapshot(MatterType.ADVISORY).map((c) =>
        c.required
          ? {
              ...c,
              completed: true,
              completedAt: "2026-04-18T15:00:00Z",
              completedBy: leadAttorneyPersonId,
            }
          : c,
      ),
    },
    create: {
      id: "m-saigon-vendor",
      organizationId: orgId,
      title: "Saigon Tech Labs — Vendor Onboarding",
      matterNumber: "M-ADV-2026-0001",
      type: MatterType.ADVISORY,
      status: MatterStatus.CLOSED,
      closedAt: new Date("2026-04-18T15:00:00Z"),
      jurisdiction: "US-CA",
      estimatedValue: 180_000,
      leadAttorneyId: leadAttorneyPersonId,
      counterpartyId: "cp-saigon",
      description:
        "Onboarding analytics vendor processing anonymised data. Standard DPA v3.1 attached. Sanctions / ABC / World-Check all clear. Closed within 24h of intake.",
      closeoutChecklistJson: checklistSnapshot(MatterType.ADVISORY).map((c) =>
        c.required
          ? {
              ...c,
              completed: true,
              completedAt: "2026-04-18T15:00:00Z",
              completedBy: leadAttorneyPersonId,
            }
          : c,
      ),
      metadata: { contractValue: "$180K/yr", dpaVersion: "3.1" },
    },
  });

  // Employment / harassment matter — has Legal Hold
  const empMatter = await prisma.matter.upsert({
    where: { id: "m-emp-harassment" },
    update: {
      title: "Confidential Employment Matter — VP Eng",
      matterNumber: "M-EMP-2026-0001",
      jurisdiction: "US-CA",
      estimatedValue: 850_000,
      closeoutChecklistJson: checklistSnapshot(MatterType.EMPLOYMENT),
    },
    create: {
      id: "m-emp-harassment",
      organizationId: orgId,
      title: "Confidential Employment Matter — VP Eng",
      matterNumber: "M-EMP-2026-0001",
      type: MatterType.EMPLOYMENT,
      status: MatterStatus.ACTIVE,
      jurisdiction: "US-CA",
      estimatedValue: 850_000,
      leadAttorneyId: leadAttorneyPersonId,
      description:
        "Harassment complaint filed against VP Engineering. External counsel engaged. Plaintiff's counsel has contacted HR directly. Subject to legal hold.",
      closeoutChecklistJson: checklistSnapshot(MatterType.EMPLOYMENT),
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

/**
 * Seed Legal Hold core (sub-PR 4b).
 *
 *  • One OrganizationHoldPolicy with sensible defaults.
 *  • Two HoldNoticeTemplate rows (default + GDPR variant) — content-
 *    hashed so HoldNoticeIssuance snapshots are stable.
 *  • One LegalHold on the Snowflake matter, ISSUED + ACTIVE, with
 *    three custodians at mixed states (acknowledged / pending /
 *    re-attestation overdue) and four data sources spanning the
 *    DataSourceType enum.
 *  • One HoldNoticeIssuance + one HoldTriggerEvent + a realistic
 *    LegalHoldEvent stream so the timeline UI has data to render.
 */
async function seedLegalHold(
  orgId: string,
  matterIdForHold: string,
  adminUserId: string,
) {
  // ── Org policy ────────────────────────────────────────────────
  await prisma.organizationHoldPolicy.upsert({
    where: { organizationId: orgId },
    update: {},
    create: {
      organizationId: orgId,
      defaultAttestationCadenceDays: 90,
      reminderLeadTimeDays: 7,
      escalationChainJson: [
        { level: 1, afterDays: 7, notifyRoleNames: ["paralegal"] },
        { level: 2, afterDays: 14, notifyRoleNames: ["attorney"] },
        { level: 3, afterDays: 21, notifyRoleNames: ["gc"] },
      ],
      jurisdictionPoliciesJson: {
        EU: {
          cadenceDays: 60,
          mandatoryLanguageMd:
            "This notice complies with GDPR Article 17(3)(e) — preservation for the establishment, exercise or defence of legal claims.",
        },
      },
    },
  });

  // ── Notice templates (default + GDPR) ────────────────────────
  const defaultBody = [
    "# Legal Hold Notice",
    "",
    "You are receiving this notice because data in your custody is potentially relevant to ongoing legal proceedings.",
    "",
    "**Effective immediately**, you must:",
    "",
    "1. Preserve all email, files, chat history, and other documents related to the matter.",
    "2. Suspend any retention or auto-deletion policies that would affect this data.",
    "3. Acknowledge receipt of this notice and re-attest quarterly until released.",
    "",
    "Failure to comply may result in spoliation sanctions under FRCP Rule 37(e).",
  ].join("\n");
  const defaultHash = createHash("sha256").update(defaultBody).digest("hex");
  await prisma.holdNoticeTemplate.upsert({
    where: { id: "tmpl-default-en" },
    update: { bodyMarkdown: defaultBody, bodyHash: defaultHash },
    create: {
      id: "tmpl-default-en",
      organizationId: orgId,
      name: "Default English",
      jurisdictionKey: null,
      bodyMarkdown: defaultBody,
      bodyHash: defaultHash,
      version: 1,
      isActive: true,
    },
  });

  const gdprBody =
    defaultBody +
    "\n\n---\n\n" +
    "**GDPR notice.** This preservation obligation operates as a lawful basis under GDPR Article 17(3)(e). Custodians retain rights to access and rectification under Articles 15 and 16; contact privacy@aegis-demo.example.";
  const gdprHash = createHash("sha256").update(gdprBody).digest("hex");
  await prisma.holdNoticeTemplate.upsert({
    where: { id: "tmpl-gdpr" },
    update: { bodyMarkdown: gdprBody, bodyHash: gdprHash },
    create: {
      id: "tmpl-gdpr",
      organizationId: orgId,
      name: "GDPR — EU jurisdictions",
      jurisdictionKey: "EU",
      bodyMarkdown: gdprBody,
      bodyHash: gdprHash,
      version: 1,
      isActive: true,
    },
  });

  // ── Hold scope templates (sub-PR 4c.4) ───────────────────────
  // Two seeded examples so the create-hold dropdown has real-shaped
  // options and the admin templates page isn't empty out of the box.
  await prisma.holdScopeTemplate.upsert({
    where: { id: "scope-tmpl-employment" },
    update: {},
    create: {
      id: "scope-tmpl-employment",
      organizationId: orgId,
      name: "Employment dispute",
      description:
        "Generic employment-matter scope (US jurisdictions, ~3yr lookback)",
      scopeMarkdown: [
        "All electronic communications, documents, and HR records of the",
        "named custodians for the period beginning 36 months prior to",
        "trigger and continuing through release.",
        "",
        "Includes: M365 mailbox + OneDrive + SharePoint + Teams, HR system",
        "(performance reviews, comp records, complaint filings),",
        "Slack/Teams DMs, and any local device snapshots taken during the",
        "preservation window.",
        "",
        "Excludes: personal devices not in BYOD program; calendar invites",
        "older than the 36-month window unless responsive to a subsequent",
        "amendment.",
      ].join("\n"),
      defaultJurisdictions: ["US-CA", "US-NY", "US-FED"],
      createdById: adminUserId,
    },
  });
  await prisma.holdScopeTemplate.upsert({
    where: { id: "scope-tmpl-ip" },
    update: {},
    create: {
      id: "scope-tmpl-ip",
      organizationId: orgId,
      name: "IP litigation",
      description:
        "IP-focused scope with broader engineering + research preservation",
      scopeMarkdown: [
        "All electronic communications, source-control history, design",
        "documents, lab notebooks, and product specifications relating to",
        "the disputed technology, beginning 60 months prior to trigger and",
        "continuing through release.",
        "",
        "Includes: Engineering team mailboxes + Git/GitHub repos +",
        "Confluence/Notion + Figma + design review tooling + invention",
        "disclosure systems + patent docket.",
        "",
        "Special handling: maintain chain-of-custody for any source-control",
        "exports; flag third-party licensed code for separate counsel",
        "review before production.",
      ].join("\n"),
      defaultJurisdictions: ["US-FED", "US-CA", "EU-DE"],
      createdById: adminUserId,
    },
  });

  // ── Custodians (Persons) ──────────────────────────────────────
  const custodianA = await prisma.person.upsert({
    where: { id: "p-cust-vp-eng" },
    update: { name: "Priya Kulkarni" },
    create: {
      id: "p-cust-vp-eng",
      organizationId: orgId,
      type: PersonType.CUSTODIAN,
      externalRef: "custodian:vp-eng-001",
      name: "Priya Kulkarni",
      email: "priya.kulkarni@aegis-demo.example",
      metadata: { department: "Engineering", role: "VP Engineering" },
    },
  });
  const custodianB = await prisma.person.upsert({
    where: { id: "p-cust-team-lead" },
    update: { name: "Marcus Reid" },
    create: {
      id: "p-cust-team-lead",
      organizationId: orgId,
      type: PersonType.CUSTODIAN,
      externalRef: "custodian:team-lead-002",
      name: "Marcus Reid",
      email: "marcus.reid@aegis-demo.example",
      metadata: { department: "Engineering", role: "Team Lead" },
    },
  });
  const custodianC = await prisma.person.upsert({
    where: { id: "p-cust-finance" },
    update: { name: "Rhea Malhotra" },
    create: {
      id: "p-cust-finance",
      organizationId: orgId,
      type: PersonType.CUSTODIAN,
      externalRef: "custodian:finance-003",
      name: "Rhea Malhotra",
      email: "rhea.malhotra@aegis-demo.example",
      metadata: { department: "Finance", role: "Director" },
    },
  });

  // ── The hold itself ──────────────────────────────────────────
  const issuedAt = new Date("2026-04-17T10:00:00Z");
  const hold = await prisma.legalHold.upsert({
    where: { id: "lh-snowflake" },
    update: {
      status: LegalHoldStatus.ACTIVE,
      title: "Snowflake MSA — preservation",
    },
    create: {
      id: "lh-snowflake",
      organizationId: orgId,
      matterId: matterIdForHold,
      holdNumber: "LH-2026-0001",
      title: "Snowflake MSA — preservation",
      scopeDescription:
        "All email, OneDrive, SharePoint, Teams, and Slack data related to the Snowflake MSA renewal — including IP §8.2 review and counterparty negotiation correspondence — for the period 2026-01-01 forward.",
      jurisdictions: ["US-CA", "EU"],
      status: LegalHoldStatus.ACTIVE,
      triggeredAt: new Date("2026-04-15T09:00:00Z"),
      triggerEventDescription:
        "Counterparty escalated IP §8.2 ambiguity to outside counsel — litigation reasonably anticipated.",
      issuedAt,
      privilegeFlags: {
        hasInhouseCounselCustodian: false,
        hasOutsideCounselCustodian: false,
        attorneyClientFlagged: false,
        workProductFlagged: true,
      },
      affectsDepartedCustodians: false,
      createdById: adminUserId,
    },
  });

  // ── Trigger event row ────────────────────────────────────────
  await prisma.holdTriggerEvent.upsert({
    where: { id: "trigger-snowflake-001" },
    update: {},
    create: {
      id: "trigger-snowflake-001",
      legalHoldId: hold.id,
      eventDescription:
        "Counterparty escalated IP §8.2 ambiguity to outside counsel — litigation reasonably anticipated.",
      occurredAt: new Date("2026-04-15T09:00:00Z"),
      recordedById: adminUserId,
    },
  });

  // ── Custodians on the hold (mixed acknowledgment states) ────
  const lhcA = await prisma.legalHoldCustodian.upsert({
    where: { legalHoldId_personId: { legalHoldId: hold.id, personId: custodianA.id } },
    update: {},
    create: {
      id: "lhc-priya",
      legalHoldId: hold.id,
      personId: custodianA.id,
      acknowledgedAt: new Date("2026-04-17T11:30:00Z"),
      acknowledgmentMetadata: {
        ip: "10.20.30.40",
        userAgent: "Mozilla/5.0 (Macintosh)",
        attestationStatement:
          "I confirm I have suspended auto-deletion across email, OneDrive, and Teams.",
      },
      lastReAttestedAt: new Date("2026-04-17T11:32:00Z"),
      nextReAttestationDueAt: new Date("2026-07-17T11:32:00Z"),
    },
  });
  const lhcB = await prisma.legalHoldCustodian.upsert({
    where: { legalHoldId_personId: { legalHoldId: hold.id, personId: custodianB.id } },
    update: {},
    create: {
      id: "lhc-marcus",
      legalHoldId: hold.id,
      personId: custodianB.id,
      // pending — no acknowledgedAt
      nextReAttestationDueAt: new Date("2026-04-24T10:00:00Z"),
    },
  });
  const lhcC = await prisma.legalHoldCustodian.upsert({
    where: { legalHoldId_personId: { legalHoldId: hold.id, personId: custodianC.id } },
    update: {},
    create: {
      id: "lhc-rhea",
      legalHoldId: hold.id,
      personId: custodianC.id,
      acknowledgedAt: new Date("2026-04-18T08:15:00Z"),
      acknowledgmentMetadata: {
        ip: "10.20.30.99",
        userAgent: "Mozilla/5.0 (Windows)",
        attestationStatement: "Acknowledged.",
      },
      lastReAttestedAt: new Date("2026-01-18T08:15:00Z"),
      // overdue — drives "re-attestation overdue" indicator in UI
      nextReAttestationDueAt: new Date("2026-04-18T08:15:00Z"),
    },
  });

  // ── Data sources per custodian ──────────────────────────────
  const dataSources: Array<{
    id: string;
    legalHoldCustodianId: string;
    type: DataSourceType;
    externalIdentifier: string;
    displayLabel: string;
    preservationAction: PreservationAction;
    preservationAppliedAt?: Date;
    preservationConfirmedAt?: Date;
    preservationConfirmedById?: string;
    retentionPolicyConflict?: boolean;
  }> = [
    {
      id: "ds-priya-email",
      legalHoldCustodianId: lhcA.id,
      type: DataSourceType.EMAIL_MAILBOX,
      externalIdentifier: "exchange:priya.kulkarni",
      displayLabel: "Priya — Exchange mailbox",
      preservationAction: PreservationAction.LEGAL_HOLD_IN_PLACE,
      preservationAppliedAt: new Date("2026-04-17T10:05:00Z"),
      preservationConfirmedAt: new Date("2026-04-17T10:45:00Z"),
      preservationConfirmedById: adminUserId,
    },
    {
      id: "ds-priya-onedrive",
      legalHoldCustodianId: lhcA.id,
      type: DataSourceType.ONEDRIVE,
      externalIdentifier: "od:priya.kulkarni",
      displayLabel: "Priya — OneDrive",
      preservationAction: PreservationAction.LEGAL_HOLD_IN_PLACE,
      preservationAppliedAt: new Date("2026-04-17T10:06:00Z"),
      preservationConfirmedAt: new Date("2026-04-17T10:46:00Z"),
      preservationConfirmedById: adminUserId,
    },
    {
      id: "ds-priya-teams",
      legalHoldCustodianId: lhcA.id,
      type: DataSourceType.TEAMS_DM,
      externalIdentifier: "teams:dm:priya",
      displayLabel: "Priya — Teams DMs",
      preservationAction: PreservationAction.RETENTION_SUSPENDED,
      preservationAppliedAt: new Date("2026-04-17T10:08:00Z"),
      preservationConfirmedAt: new Date("2026-04-17T10:49:00Z"),
      preservationConfirmedById: adminUserId,
    },
    {
      id: "ds-marcus-email",
      legalHoldCustodianId: lhcB.id,
      type: DataSourceType.EMAIL_MAILBOX,
      externalIdentifier: "exchange:marcus.reid",
      displayLabel: "Marcus — Exchange mailbox",
      preservationAction: PreservationAction.LEGAL_HOLD_IN_PLACE,
      preservationAppliedAt: new Date("2026-04-17T10:05:00Z"),
      // preservation applied but not yet IT-confirmed — drives gap UI
    },
    {
      id: "ds-marcus-slack",
      legalHoldCustodianId: lhcB.id,
      type: DataSourceType.SLACK_DM,
      externalIdentifier: "slack:dm:marcus",
      displayLabel: "Marcus — Slack DMs",
      preservationAction: PreservationAction.THIRD_PARTY_COLLECTION_PENDING,
      retentionPolicyConflict: true, // Slack 90-day default not yet overridden
    },
    {
      id: "ds-rhea-sharepoint",
      legalHoldCustodianId: lhcC.id,
      type: DataSourceType.SHAREPOINT_SITE,
      externalIdentifier: "spo:finance-vp-team-site",
      displayLabel: "Rhea — Finance team SharePoint",
      preservationAction: PreservationAction.LEGAL_HOLD_IN_PLACE,
      preservationAppliedAt: new Date("2026-04-18T09:00:00Z"),
      preservationConfirmedAt: new Date("2026-04-18T10:00:00Z"),
      preservationConfirmedById: adminUserId,
    },
    {
      id: "ds-rhea-ephemeral",
      legalHoldCustodianId: lhcC.id,
      type: DataSourceType.EPHEMERAL_CHAT_AUTO_DELETE,
      externalIdentifier: "ephemeral:rhea-snap",
      displayLabel: "Rhea — Snap chat (ephemeral)",
      preservationAction: PreservationAction.PRESERVATION_FAILED,
      preservationAppliedAt: new Date("2026-04-18T09:01:00Z"),
      retentionPolicyConflict: true, // ephemeral by design
    },
  ];

  for (const ds of dataSources) {
    await prisma.custodianDataSource.upsert({
      where: { id: ds.id },
      update: {},
      create: ds,
    });
  }

  // ── Notice issuance (uses default template) ─────────────────
  await prisma.holdNoticeIssuance.upsert({
    where: { id: "issuance-snowflake-001" },
    update: {},
    create: {
      id: "issuance-snowflake-001",
      legalHoldId: hold.id,
      templateId: "tmpl-default-en",
      templateVersion: 1,
      bodyHashAtIssuance: defaultHash,
      recipientCount: 3,
      issuedAt: new Date("2026-04-17T10:05:00Z"),
      issuedById: adminUserId,
    },
  });

  // ── Hold event stream ───────────────────────────────────────
  // Idempotent — clear and re-insert the seeded events; production
  // mutation paths go through recordHoldEvent and do not run here.
  await prisma.legalHoldEvent.deleteMany({ where: { legalHoldId: hold.id } });
  const events: Array<{
    type:
      | "HOLD_DRAFTED"
      | "TRIGGER_RECORDED"
      | "HOLD_ISSUED"
      | "CUSTODIAN_ADDED"
      | "CUSTODIAN_ACKNOWLEDGED"
      | "DATA_SOURCE_ADDED"
      | "DATA_SOURCE_PRESERVATION_CONFIRMED"
      | "REMINDER_SENT";
    summary: string;
    occurredAt: Date;
    actorType?: string;
  }> = [
    {
      type: "HOLD_DRAFTED",
      summary: "Hold drafted for Snowflake MSA",
      occurredAt: new Date("2026-04-15T09:00:00Z"),
    },
    {
      type: "TRIGGER_RECORDED",
      summary: "Litigation reasonably anticipated — IP §8.2 escalation",
      occurredAt: new Date("2026-04-15T09:01:00Z"),
    },
    {
      type: "HOLD_ISSUED",
      summary: "Hold issued — 3 custodians notified",
      occurredAt: new Date("2026-04-17T10:00:00Z"),
    },
    {
      type: "CUSTODIAN_ADDED",
      summary: "Priya Kulkarni added as custodian",
      occurredAt: new Date("2026-04-17T10:01:00Z"),
    },
    {
      type: "CUSTODIAN_ADDED",
      summary: "Marcus Reid added as custodian",
      occurredAt: new Date("2026-04-17T10:02:00Z"),
    },
    {
      type: "CUSTODIAN_ADDED",
      summary: "Rhea Malhotra added as custodian",
      occurredAt: new Date("2026-04-17T10:03:00Z"),
    },
    {
      type: "DATA_SOURCE_PRESERVATION_CONFIRMED",
      summary: "Email mailbox preservation confirmed for Priya Kulkarni",
      occurredAt: new Date("2026-04-17T10:46:00Z"),
    },
    {
      type: "CUSTODIAN_ACKNOWLEDGED",
      summary: "Priya Kulkarni acknowledged the hold notice",
      occurredAt: new Date("2026-04-17T11:30:00Z"),
    },
    {
      type: "CUSTODIAN_ACKNOWLEDGED",
      summary: "Rhea Malhotra acknowledged the hold notice",
      occurredAt: new Date("2026-04-18T08:15:00Z"),
    },
    {
      type: "REMINDER_SENT",
      summary: "Reminder sent to Marcus Reid (acknowledgment pending)",
      occurredAt: new Date("2026-04-22T09:00:00Z"),
      actorType: "SYSTEM",
    },
  ];
  for (const ev of events) {
    await prisma.legalHoldEvent.create({
      data: {
        legalHoldId: hold.id,
        type: ev.type,
        summary: ev.summary,
        actorType: ev.actorType ?? "USER",
        actorId: ev.actorType === "SYSTEM" ? null : adminUserId,
        occurredAt: ev.occurredAt,
      },
    });
  }

  return hold;
}

// ───────────────────────────────────────────────────────────────────
// Entry point
// ───────────────────────────────────────────────────────────────────

// ── 3c. Sample matter tasks ──────────────────────────────────────
//
// Three open tasks on the Snowflake MSA matter so the matter detail UI
// has realistic content. Idempotent via stable ids.

async function seedMatterTasks(_orgId: string, alexUserId: string) {
  const tasks = [
    {
      id: "task-snow-redline",
      matterId: "m-snowflake-msa",
      title: "Turn redline on §3 (payment terms)",
      source: "manual",
    },
    {
      id: "task-snow-ip-review",
      matterId: "m-snowflake-msa",
      title: "Route §8.2 (IP) to Patricia for ambiguity review",
      source: "manual",
    },
    {
      id: "task-snow-final-execution",
      matterId: "m-snowflake-msa",
      title: "Schedule final execution call",
      source: "manual",
      dependsOnTaskId: "task-snow-redline",
    },
  ];

  for (const t of tasks) {
    await prisma.matterTask.upsert({
      where: { id: t.id },
      update: { title: t.title },
      create: {
        id: t.id,
        matterId: t.matterId,
        title: t.title,
        source: t.source,
        createdBy: alexUserId,
        dependsOnTaskId: "dependsOnTaskId" in t ? t.dependsOnTaskId : null,
      },
    });
  }
  return tasks.length;
}

// ── 3d. Synthetic AuditLog seed row ──────────────────────────────
//
// Writes a "system.boot" row so the AuditLog chain has a known
// genesis after migration. The CI db-integrity job runs
// audit-canary.ts after seeding to validate the chain — without at
// least one row, the canary trivially passes with rows=0 and the
// trigger never gets exercised.
//
// Idempotent via a deterministic resourceId; on re-runs we look up
// by (orgId, action, resourceId) and skip if present.

// ── 3e. Seeded matter audit rows ─────────────────────────────────
//
// Seed creates Matter rows via raw upsert (it has to — at seed time
// there's no actor session, no matter API surface). To make the demo
// self-consistent — every matter has provable audit history — we
// write a matter.created AuditLog row for each seeded matter through
// the same chain-sealed path the API uses.
//
// Idempotent: per (orgId, action="matter.created", resourceId) we
// check first and skip if already present, so re-running the seed
// does not duplicate rows or extend the chain unnecessarily.

interface SeededMatterAuditFixture {
  matterId: string;
  title: string;
  type: string;
  status: string;
  jurisdiction: string | null;
  estimatedValue: number | null;
  matterNumber: string | null;
  counterpartyId: string | null;
  leadAttorneyId: string;
  closedAt?: string | null;
}

async function seedMatterAuditRows(
  orgId: string,
  actorUserId: string,
  alexPersonId: string,
) {
  const fixtures: SeededMatterAuditFixture[] = [
    {
      matterId: "m-snowflake-msa",
      title: "Snowflake MSA — Renewal & Re-papering",
      type: "TRANSACTIONAL",
      status: "OPEN",
      jurisdiction: "US-CA",
      estimatedValue: 2_400_000,
      matterNumber: "M-TXN-2026-0001",
      counterpartyId: "cp-snowflake",
      leadAttorneyId: alexPersonId,
    },
    {
      matterId: "m-saigon-vendor",
      title: "Saigon Tech Labs — Vendor Onboarding",
      type: "ADVISORY",
      status: "CLOSED",
      jurisdiction: "US-CA",
      estimatedValue: 180_000,
      matterNumber: "M-ADV-2026-0001",
      counterpartyId: "cp-saigon",
      leadAttorneyId: alexPersonId,
      closedAt: "2026-04-18T15:00:00Z",
    },
    {
      matterId: "m-emp-harassment",
      title: "Confidential Employment Matter — VP Eng",
      type: "EMPLOYMENT",
      status: "ACTIVE",
      jurisdiction: "US-CA",
      estimatedValue: 850_000,
      matterNumber: "M-EMP-2026-0001",
      counterpartyId: null,
      leadAttorneyId: alexPersonId,
    },
  ];

  let written = 0;
  let skipped = 0;
  for (const f of fixtures) {
    const existing = await prisma.auditLog.findFirst({
      where: {
        organizationId: orgId,
        action: "matter.created",
        resourceType: "Matter",
        resourceId: f.matterId,
      },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorId: actorUserId,
        actorType: "USER",
        action: "matter.created",
        resourceType: "Matter",
        resourceId: f.matterId,
        afterJson: {
          id: f.matterId,
          matterNumber: f.matterNumber,
          title: f.title,
          type: f.type,
          status: f.status,
          jurisdiction: f.jurisdiction,
          counterpartyId: f.counterpartyId,
          leadAttorneyId: f.leadAttorneyId,
          ...(f.closedAt ? { closedAt: f.closedAt } : {}),
        },
        metadata: { source: "seed", note: "demo-seeded matter" },
      },
    });
    written++;
  }
  return { written, skipped };
}

async function seedSystemBootAudit(orgId: string) {
  const resourceId = "demo-org-bootstrap";
  const existing = await prisma.auditLog.findFirst({
    where: {
      organizationId: orgId,
      action: "system.boot",
      resourceId,
    },
    select: { id: true },
  });
  if (existing) return false;
  await prisma.auditLog.create({
    data: {
      organizationId: orgId,
      actorId: null,
      actorType: "SYSTEM",
      action: "system.boot",
      resourceType: "Organization",
      resourceId,
      afterJson: { seededAt: new Date().toISOString() },
      metadata: { source: "seed", purpose: "audit-chain canary fixture" },
    },
  });
  return true;
}

/**
 * Production-foundation seed (AEGIS_SEED_PROFILE=production).
 *
 * For a real client deployment: seeds ONLY what the platform needs to
 * run — the org, the admin (from SEED_ADMIN_EMAIL / SEED_ADMIN_NAME),
 * the 8 role bundles, matter-type configs (so intake→matter auto-spawn
 * numbers correctly), the OFAC sanctions bootstrap list (so the Vendor
 * agent screens for real), and the audit-chain genesis row. NO demo
 * tickets, matters, holds, personas, spend, or privacy data.
 *
 * Idempotent and safe to re-run. Set SEED_ADMIN_EMAIL + SEED_ADMIN_NAME
 * before running so the admin row matches the client's Auth0 login.
 */
async function seedProductionFoundation() {
  console.log("[seed:production] starting clean foundation…");
  const { org, user } = await seedOrgAndAdmin();
  const roles = await seedRoles(org.id);
  const typeConfigs = await seedMatterTypeConfigs(org.id);
  const bootRowAdded = await seedSystemBootAudit(org.id);
  const sanctions = await seedSanctionsList();
  console.log(
    `[seed:production] org=${org.id} admin=${user.id} roles=${roles} ` +
      `matter_type_configs=${typeConfigs} sanctions_list_entries=${sanctions} ` +
      `genesis_audit=${bootRowAdded}`,
  );
  console.log(
    "[seed:production] done. No demo data seeded. " +
      "Configure routing rules + users in the admin UI.",
  );
}

// ───────────────────────────────────────────────────────────────────
// Section 8 — Contracts (CTR-1)
// ───────────────────────────────────────────────────────────────────
//
// The CLM system of record. Contracts attach to the shared entities:
// counterparty = Counterparty, matter = Matter. Clauses are the one
// contract-specific shape (ContractClause). Commitments are the SHARED
// Obligation entity (sourceType=CONTRACT) — the same rows Company Brain,
// Regulatory, and Governance query. The Snowflake MSA mirrors the seeded
// matter/hold storyline (IP §8.2 ambiguity, Net-30-vs-45 payment terms)
// so the demo reads as one connected brain across modules.
//
// Idempotent: every row upserts on an explicit id. Dates are anchored to
// the seed run so "expiring soon" / "overdue" render live.

async function seedContracts(orgId: string, ownerPersonId: string) {
  const now = new Date();
  const day = 86_400_000;
  const at = (deltaDays: number) => new Date(now.getTime() + deltaDays * day);

  type ClauseSeed = {
    id: string;
    type: string;
    text: string;
    summary?: string;
    risk: ContractRisk;
    deviation?: boolean;
  };
  type ObligationSeed = {
    id: string;
    description: string;
    dueDate?: Date | null;
    recurrence?: string | null;
    ownerId?: string | null;
    status?: ObligationStatus;
  };
  type ContractSeed = {
    id: string;
    title: string;
    type: string;
    status: ContractStatus;
    risk: ContractRisk;
    value?: number | null;
    currency?: string;
    counterpartyId?: string | null;
    matterId?: string | null;
    effectiveDate?: Date | null;
    expiryDate?: Date | null;
    autoRenew?: boolean;
    noticeWindowDays?: number | null;
    governingLaw?: string | null;
    clauses: ClauseSeed[];
    obligations: ObligationSeed[];
  };

  const CONTRACTS: ContractSeed[] = [
    {
      id: "ct-snowflake-msa",
      title: "Snowflake MSA — Master Services Agreement",
      type: "Master Services Agreement",
      status: ContractStatus.ACTIVE,
      risk: ContractRisk.HIGH,
      value: 2_400_000,
      currency: "USD",
      counterpartyId: "cp-snowflake",
      matterId: "m-snowflake-msa",
      effectiveDate: at(-350),
      expiryDate: at(45), // inside the 90d renewal window
      autoRenew: true,
      noticeWindowDays: 60,
      governingLaw: "Delaware, USA",
      clauses: [
        { id: "cl-snow-liability", type: "LIABILITY_CAP", risk: ContractRisk.HIGH, deviation: true, summary: "Cap set at 12 months of fees — playbook requires 24.", text: "Aggregate liability capped at fees paid in the 12 months preceding the claim. Playbook standard is 24 months; deviation escalated to GC." },
        { id: "cl-snow-ip", type: "IP", risk: ContractRisk.HIGH, deviation: true, summary: "§8.2 ownership of derivative works is ambiguous.", text: "Section 8.2 leaves ownership of jointly-developed derivative works undefined. Flagged for IP team; counterparty escalated to outside counsel." },
        { id: "cl-snow-payment", type: "PAYMENT", risk: ContractRisk.MEDIUM, deviation: true, summary: "Counterparty proposes Net 30 vs our Net 45.", text: "Payment terms Net 30. Company playbook is Net 45. Under negotiation by Engineering / Finance." },
        { id: "cl-snow-autorenew", type: "AUTO_RENEWAL", risk: ContractRisk.MEDIUM, deviation: false, summary: "12-month auto-renew, 60-day notice.", text: "Agreement auto-renews for successive 12-month terms unless either party gives 60 days' written notice." },
        { id: "cl-snow-law", type: "GOVERNING_LAW", risk: ContractRisk.LOW, deviation: false, text: "Governed by the laws of the State of Delaware." },
      ],
      obligations: [
        { id: "obl-snow-renewal", description: "Serve or waive renewal notice (60-day window before expiry)", dueDate: at(-15), ownerId: ownerPersonId, status: ObligationStatus.OPEN },
        { id: "obl-snow-ip", description: "Resolve §8.2 derivative-works ownership ambiguity with IP team", dueDate: at(-7), ownerId: ownerPersonId, status: ObligationStatus.IN_PROGRESS },
        { id: "obl-snow-soc2", description: "Obtain annual SOC 2 Type II report from vendor", dueDate: at(120), recurrence: "FREQ=YEARLY", ownerId: ownerPersonId, status: ObligationStatus.OPEN },
      ],
    },
    {
      id: "ct-globex-supply",
      title: "Globex Industries — Supply Agreement",
      type: "Supply Agreement",
      status: ContractStatus.ACTIVE,
      risk: ContractRisk.MEDIUM,
      value: 850_000,
      currency: "USD",
      counterpartyId: "cp-globex",
      effectiveDate: at(-190),
      expiryDate: at(175),
      autoRenew: false,
      governingLaw: "New York, USA",
      clauses: [
        { id: "cl-globex-term", type: "TERMINATION", risk: ContractRisk.MEDIUM, deviation: false, summary: "90-day termination for convenience.", text: "Either party may terminate for convenience on 90 days' written notice." },
        { id: "cl-globex-indemnity", type: "INDEMNITY", risk: ContractRisk.MEDIUM, deviation: true, summary: "Mutual indemnity narrower than playbook.", text: "Indemnity limited to third-party IP claims. Playbook expects broader mutual indemnity including data-breach claims." },
        { id: "cl-globex-warranty", type: "WARRANTY", risk: ContractRisk.LOW, deviation: false, text: "Goods warranted against defects for 12 months from delivery." },
      ],
      obligations: [
        { id: "obl-globex-volume", description: "Submit quarterly volume forecast to supplier", dueDate: at(20), recurrence: "FREQ=QUARTERLY", ownerId: ownerPersonId, status: ObligationStatus.OPEN },
        { id: "obl-globex-price", description: "Conduct annual price review before renewal", dueDate: at(120), ownerId: ownerPersonId, status: ObligationStatus.OPEN },
      ],
    },
    {
      id: "ct-datastream-dpa",
      title: "DataStream AI — Data Processing Addendum",
      type: "Data Processing Addendum",
      status: ContractStatus.EXECUTED,
      risk: ContractRisk.MEDIUM,
      value: null,
      currency: "USD",
      counterpartyId: "cp-datastream",
      effectiveDate: at(-120),
      expiryDate: null,
      autoRenew: false,
      governingLaw: "EU (GDPR)",
      clauses: [
        { id: "cl-ds-confidentiality", type: "CONFIDENTIALITY", risk: ContractRisk.LOW, deviation: false, text: "Standard mutual confidentiality with 3-year survival." },
        { id: "cl-ds-subprocessor", type: "OTHER", risk: ContractRisk.MEDIUM, deviation: false, summary: "Sub-processor list requires 30-day change notice.", text: "Processor must give 30 days' notice before adding or replacing a sub-processor; controller may object." },
      ],
      obligations: [
        { id: "obl-ds-audit", description: "Exercise annual audit right against processor", dueDate: at(230), recurrence: "FREQ=YEARLY", ownerId: ownerPersonId, status: ObligationStatus.OPEN },
      ],
    },
    {
      id: "ct-deloitte-sow",
      title: "Deloitte — Advisory Statement of Work",
      type: "Statement of Work",
      status: ContractStatus.IN_NEGOTIATION,
      risk: ContractRisk.LOW,
      value: 320_000,
      currency: "USD",
      counterpartyId: "cp-deloitte",
      effectiveDate: null,
      expiryDate: null,
      autoRenew: false,
      governingLaw: "Delaware, USA",
      clauses: [
        { id: "cl-del-payment", type: "PAYMENT", risk: ContractRisk.LOW, deviation: false, summary: "Milestone-based, Net 45.", text: "Fees invoiced on milestone completion, payable Net 45. Aligns with playbook." },
      ],
      obligations: [],
    },
    {
      id: "ct-acme-nda",
      title: "Acme Corp — Mutual NDA",
      type: "NDA",
      status: ContractStatus.ACTIVE,
      risk: ContractRisk.LOW,
      value: null,
      currency: "USD",
      counterpartyId: "cp-acme",
      effectiveDate: at(-70),
      expiryDate: at(660),
      autoRenew: false,
      governingLaw: "Delaware, USA",
      clauses: [
        { id: "cl-acme-confidentiality", type: "CONFIDENTIALITY", risk: ContractRisk.LOW, deviation: false, text: "Mutual confidentiality, 2-year term, 3-year survival on trade secrets." },
        { id: "cl-acme-term", type: "TERMINATION", risk: ContractRisk.LOW, deviation: false, text: "Either party may terminate on 30 days' notice; confidentiality obligations survive." },
      ],
      obligations: [
        { id: "obl-acme-return", description: "Return or destroy confidential materials on termination", dueDate: null, ownerId: ownerPersonId, status: ObligationStatus.OPEN },
      ],
    },
  ];

  let clauseCount = 0;
  let obligationCount = 0;

  for (const c of CONTRACTS) {
    await prisma.contract.upsert({
      where: { id: c.id },
      update: {
        title: c.title,
        type: c.type,
        status: c.status,
        risk: c.risk,
        value: c.value ?? null,
        currency: c.currency ?? "USD",
        counterpartyId: c.counterpartyId ?? null,
        matterId: c.matterId ?? null,
        effectiveDate: c.effectiveDate ?? null,
        expiryDate: c.expiryDate ?? null,
        autoRenew: c.autoRenew ?? false,
        noticeWindowDays: c.noticeWindowDays ?? null,
        governingLaw: c.governingLaw ?? null,
      },
      create: {
        id: c.id,
        organizationId: orgId,
        title: c.title,
        type: c.type,
        status: c.status,
        risk: c.risk,
        value: c.value ?? null,
        currency: c.currency ?? "USD",
        counterpartyId: c.counterpartyId ?? null,
        matterId: c.matterId ?? null,
        effectiveDate: c.effectiveDate ?? null,
        expiryDate: c.expiryDate ?? null,
        autoRenew: c.autoRenew ?? false,
        noticeWindowDays: c.noticeWindowDays ?? null,
        governingLaw: c.governingLaw ?? null,
      },
    });

    for (const cl of c.clauses) {
      await prisma.contractClause.upsert({
        where: { id: cl.id },
        update: { type: cl.type, text: cl.text, summary: cl.summary ?? null, risk: cl.risk, deviation: cl.deviation ?? false },
        create: {
          id: cl.id,
          contractId: c.id,
          type: cl.type,
          text: cl.text,
          summary: cl.summary ?? null,
          risk: cl.risk,
          deviation: cl.deviation ?? false,
        },
      });
      clauseCount++;
    }

    for (const o of c.obligations) {
      await prisma.obligation.upsert({
        where: { id: o.id },
        update: {
          description: o.description,
          dueDate: o.dueDate ?? null,
          recurrence: o.recurrence ?? null,
          ownerId: o.ownerId ?? null,
          status: o.status ?? ObligationStatus.OPEN,
        },
        create: {
          id: o.id,
          organizationId: orgId,
          sourceType: ObligationSourceType.CONTRACT,
          sourceId: c.id,
          description: o.description,
          dueDate: o.dueDate ?? null,
          recurrence: o.recurrence ?? null,
          ownerId: o.ownerId ?? null,
          status: o.status ?? ObligationStatus.OPEN,
        },
      });
      obligationCount++;
    }
  }

  // CTR-3 demo: a counterparty contact + a LIVE review link on the Acme
  // NDA so the tokenised portal walks end-to-end at /contract-review/<t>.
  // The raw token is a fixed demo string (safe: it's a demo tenant); the
  // row stores only its SHA-256 hash, exactly as production does.
  await prisma.person.upsert({
    where: { id: "p-acme-contact" },
    update: { name: "Jordan Fields", email: "jordan.fields@acme.example", metadata: { counterpartyId: "cp-acme" } },
    create: {
      id: "p-acme-contact",
      organizationId: orgId,
      type: PersonType.COUNTERPARTY_CONTACT,
      name: "Jordan Fields",
      email: "jordan.fields@acme.example",
      metadata: { counterpartyId: "cp-acme" },
    },
  });
  const demoRawToken = "demo-acme-nda-review-2026";
  const demoTokenHash = createHash("sha256").update(demoRawToken, "utf8").digest("hex");
  await prisma.contractReviewToken.upsert({
    where: { tokenHash: demoTokenHash },
    update: { status: "ACTIVE", expiresAt: at(30) },
    create: {
      organizationId: orgId,
      contractId: "ct-acme-nda",
      personId: "p-acme-contact",
      tokenHash: demoTokenHash,
      status: "ACTIVE",
      expiresAt: at(30),
      createdById: "seed",
    },
  });

  return { contracts: CONTRACTS.length, clauses: clauseCount, obligations: obligationCount, reviewToken: demoRawToken };
}

async function main() {
  if ((process.env.AEGIS_SEED_PROFILE ?? "").trim().toLowerCase() === "production") {
    await seedProductionFoundation();
    return;
  }

  console.log("[seed] starting…");

  const { org, user, alexPerson } = await seedOrgAndAdmin();
  console.log(`[seed] org=${org.id} user=${user.id} alex=${alexPerson.id}`);

  const cpCount = await seedCounterparties(org.id);
  const reqCount = await seedRequesters(org.id);
  const tagCount = await seedTags(org.id);
  console.log(
    `[seed] counterparties=${cpCount} requesters=${reqCount} tags=${tagCount}`,
  );

  const typeConfigCount = await seedMatterTypeConfigs(org.id);
  console.log(`[seed] matter_type_configs=${typeConfigCount}`);

  const { empMatter } = await seedMatters(org.id, alexPerson.id);
  // Hold attaches to the Snowflake matter (m-snowflake-msa) — that
  // matter already has invoices, budgets, and a counterparty wired
  // in §3, so the demo's hold detail page lights up with cross-tab
  // signal. The empMatter remains available for future fixtures.
  void empMatter;
  const hold = await seedLegalHold(org.id, "m-snowflake-msa", user.id);
  console.log(`[seed] matters=3 legal_hold=${hold.id} (status=${hold.status})`);

  const ma = await seedMatterAuditRows(org.id, user.id, alexPerson.id);
  console.log(
    `[seed] matter_audit_rows=${ma.written} skipped_existing=${ma.skipped}`,
  );

  const taskCount = await seedMatterTasks(org.id, user.id);
  console.log(`[seed] matter_tasks=${taskCount}`);

  const bootRowAdded = await seedSystemBootAudit(org.id);
  console.log(
    `[seed] system_boot_audit=${bootRowAdded ? "added" : "already present"}`,
  );

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

  const ta = await seedTicketAssignments(org.id);
  console.log(`[seed] ticket_assignments=${ta}`);

  const rr = await seedRoutingRules(org.id);
  console.log(`[seed] routing_rules=${rr}`);

  const sla = await seedSlaDemoState(org.id);
  console.log(`[seed] sla_demo_breach_candidates=${sla}`);

  const sx = await seedSanctionsList();
  console.log(`[seed] sanctions_list_entries=${sx}`);

  const nd = await seedNdaDocuments(org.id, user.id);
  console.log(`[seed] nda_documents=${nd}`);

  const ct = await seedContracts(org.id, alexPerson.id);
  console.log(
    `[seed] contracts=${ct.contracts} clauses=${ct.clauses} contract_obligations=${ct.obligations} ` +
      `review_portal=/contract-review/${ct.reviewToken}`,
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
// Section 4b — Typed ticket assignments (P1b)
// ───────────────────────────────────────────────────────────────────
//
// Gives the "My Queue" Inbox filter real data on a fresh demo. Runs
// after §7 because it references the seeded test users. Two in-flight
// tickets go to the admin (the demo presenter's session in dev mode)
// and two to the attorney test user. Both the `assignedToUserId` FK
// and the display-mirror `assignedTo` free text are written, matching
// what the Cockpit's reassign picker produces at runtime.
//
// Idempotent: plain updates keyed on fixed ticket ids; re-runs
// rewrite the same values. Skips silently if a ticket id is absent
// (e.g. fixtures changed) — seed assignment is demo sugar, not a
// schema invariant.

async function seedTicketAssignments(orgId: string): Promise<number> {
  const admin = await prisma.user.findFirst({
    where: { organizationId: orgId, role: { name: "admin" } },
  });
  const attorney = await prisma.user.findFirst({
    where: {
      organizationId: orgId,
      email: "lena.attorney@aegis-demo.example",
    },
  });

  const assignments: Array<{ ticketId: string; user: typeof admin }> = [
    // Admin: the in-review contract + the in-flight privacy question,
    // so "My Queue" has data for the presenter. Deliberately NOT a
    // Critical ticket — the Critical→GC routing rule (§4c) would
    // reassign it to the GC on the next save pass.
    { ticketId: "REQ-3401", user: admin },
    { ticketId: "REQ-3410", user: admin },
    // Attorney: the IP question + the escalated employment issue
    // (the employment routing rule converges to the same assignee).
    { ticketId: "REQ-3402", user: attorney },
    { ticketId: "REQ-3403", user: attorney },
  ];

  let written = 0;
  for (const a of assignments) {
    if (!a.user) continue;
    const res = await prisma.intakeTicket.updateMany({
      where: { id: a.ticketId, organizationId: orgId },
      data: { assignedToUserId: a.user.id, assignedTo: a.user.name },
    });
    written += res.count;
  }
  return written;
}

// ───────────────────────────────────────────────────────────────────
// Section 4c — Intake routing rules (P2a demo-lite)
// ───────────────────────────────────────────────────────────────────
//
// Four rules exercising every condition + action type. Deterministic
// ids so re-runs upsert. timesFired counts are demo fixtures (same
// spirit as the static "matches: 231" the old in-memory rules
// displayed); live firings increment from here. Runs after §7 — the
// two assignee actions reference seeded test users.

async function seedRoutingRules(orgId: string): Promise<number> {
  const gc = await prisma.user.findFirst({
    where: { organizationId: orgId, email: "marcus.gc@aegis-demo.example" },
  });
  const attorney = await prisma.user.findFirst({
    where: {
      organizationId: orgId,
      email: "lena.attorney@aegis-demo.example",
    },
  });

  const rules = [
    {
      id: "rule-breach-keyword",
      name: "Data-breach keywords escalate priority",
      description:
        'Any request whose description mentions "breach" is treated as Critical before anything else routes.',
      evalOrder: 5,
      matchKeyword: "breach",
      setPriority: "Critical",
      timesFired: 3,
    },
    {
      id: "rule-critical-gc",
      name: "Critical priority → GC fast lane",
      description:
        "Critical tickets go straight to the General Counsel with a 4-hour SLA.",
      evalOrder: 10,
      matchPriority: "Critical",
      setAssigneeUserId: gc?.id ?? null,
      setSlaHours: 4,
      timesFired: 12,
    },
    {
      id: "rule-employment",
      name: "Employment issues → senior attorney",
      description:
        "Employment matters are sensitive — route to the senior employment attorney. (Assignee only: a set-priority action here could downgrade a Critical employment ticket.)",
      evalOrder: 20,
      matchType: "Employment Issue",
      setAssigneeUserId: attorney?.id ?? null,
      timesFired: 8,
    },
    {
      id: "rule-nda-sla",
      name: "NDA fast lane (8h SLA)",
      description:
        "Standard NDAs are template work — tighten the SLA so they don't sit in the queue.",
      evalOrder: 30,
      matchType: "NDA Request",
      setSlaHours: 8,
      timesFired: 31,
    },
  ];

  let written = 0;
  for (const r of rules) {
    const { id, timesFired, ...fields } = r;
    await prisma.intakeRoutingRule.upsert({
      where: { id },
      update: { ...fields },
      create: {
        id,
        organizationId: orgId,
        timesFired,
        ...fields,
      },
    });
    written += 1;
  }
  return written;
}

// ───────────────────────────────────────────────────────────────────
// Section 4d — SLA breach-scan demo state (P1c demo-lite)
// ───────────────────────────────────────────────────────────────────
//
// Pushes REQ-3409 (Critical contract review, 8h SLA, fixture age
// 5.22h) back to 9 hours old so it is past-SLA but NOT yet escalated.
// The "Run breach scan" button on the SLA Dashboard then has a live
// target: the scan flips it to ESCALATED and writes the
// sla_breached / auto_escalated audit pair in front of the audience.
// REQ-3403 stays the "already escalated" fixture; this one is the
// "escalates live" fixture.

async function seedSlaDemoState(orgId: string): Promise<number> {
  const res = await prisma.intakeTicket.updateMany({
    where: {
      id: "REQ-3409",
      organizationId: orgId,
      status: { notIn: [IntakeStatus.ESCALATED] },
    },
    data: { submittedAt: new Date(Date.now() - 9 * 3600 * 1000) },
  });
  return res.count;
}

// ───────────────────────────────────────────────────────────────────
// Section 4e — Sanctions screening bootstrap (Intake P2b)
// ───────────────────────────────────────────────────────────────────
//
// Real OFAC-listed names so the Vendor agent's screening returns genuine
// "hit" / "clear" verdicts in the demo, and the staleness guard reads
// the list as fresh. GLOBAL reference data (no org scope). Production
// replaces this with the live Treasury SDN feed via the admin refresh
// trigger; the screening logic is identical either way. Mirrors
// modules/intake/src/sanctions/bootstrap.ts (kept inline to avoid a
// cross-package runtime import in the seed).

function normalizeSanctionsName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(inc|llc|ltd|corp|co|plc|gmbh|sa|ag|company|limited|holdings?|group)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SANCTIONS_BOOTSTRAP: ReadonlyArray<{
  sourceRef: string;
  entityName: string;
  programs: string[];
  aliases: string[];
  country: string | null;
}> = [
  { sourceRef: "sb-sberbank", entityName: "Sberbank of Russia", programs: ["RUSSIA-EO14024"], aliases: ["Sberbank", "PJSC Sberbank"], country: "Russia" },
  { sourceRef: "sb-vtb", entityName: "VTB Bank", programs: ["RUSSIA-EO14024"], aliases: ["VTB", "Bank VTB"], country: "Russia" },
  { sourceRef: "sb-rostec", entityName: "Rostec", programs: ["RUSSIA-EO14024"], aliases: ["Rostec State Corporation"], country: "Russia" },
  { sourceRef: "sb-huawei-tech", entityName: "Huawei Technologies", programs: ["NS-CMIC"], aliases: ["Huawei"], country: "China" },
  { sourceRef: "sb-zte", entityName: "ZTE Corporation", programs: ["NS-CMIC"], aliases: ["ZTE"], country: "China" },
  { sourceRef: "sb-smic", entityName: "Semiconductor Manufacturing International Corporation", programs: ["NS-CMIC"], aliases: ["SMIC"], country: "China" },
  { sourceRef: "sb-irgc", entityName: "Islamic Revolutionary Guard Corps", programs: ["SDGT", "IRAN"], aliases: ["IRGC"], country: "Iran" },
  { sourceRef: "sb-wagner", entityName: "Wagner Group", programs: ["RUSSIA-EO14024", "TCO"], aliases: ["PMC Wagner", "Wagner"], country: "Russia" },
  { sourceRef: "sb-lazarus", entityName: "Lazarus Group", programs: ["DPRK", "CYBER"], aliases: ["Lazarus", "Hidden Cobra"], country: "North Korea" },
  { sourceRef: "sb-garantex", entityName: "Garantex", programs: ["CYBER"], aliases: ["Garantex Europe OU"], country: "Russia" },
];

// ───────────────────────────────────────────────────────────────────
// Section 4f — Prior NDA document (Intake P2b)
// ───────────────────────────────────────────────────────────────────
//
// One executed NDA document on the Snowflake matter so the NDA agent's
// counterparty lookup detects a REAL prior NDA (via the counterparty's
// matters) and recommends reuse. Demo: file an NDA request mentioning
// "Snowflake" and the agent surfaces this document. Deterministic id →
// idempotent upsert.

async function seedNdaDocuments(
  orgId: string,
  userId: string,
): Promise<number> {
  // Snowflake matter (cp-snowflake) exists from §3; attach an NDA doc.
  const matter = await prisma.matter.findFirst({
    where: { organizationId: orgId, counterpartyId: "cp-snowflake" },
    select: { id: true },
  });
  if (!matter) return 0;
  await prisma.document.upsert({
    where: { id: "doc-nda-snowflake" },
    update: { name: "Mutual NDA — Snowflake Inc. (executed)" },
    create: {
      id: "doc-nda-snowflake",
      organizationId: orgId,
      name: "Mutual NDA — Snowflake Inc. (executed)",
      mimeType: "application/pdf",
      sizeBytes: 184320,
      storageUrl: "s3://aegis-demo/nda/snowflake-mutual-nda.pdf",
      ownerType: "MATTER",
      ownerId: matter.id,
      uploadedBy: userId,
    },
  });
  return 1;
}

async function seedSanctionsList(): Promise<number> {
  const refreshedAt = new Date();
  let written = 0;
  for (const e of SANCTIONS_BOOTSTRAP) {
    await prisma.sanctionsListEntry.upsert({
      where: { source_sourceRef: { source: "BOOTSTRAP", sourceRef: e.sourceRef } },
      update: {
        entityName: e.entityName,
        normalizedName: normalizeSanctionsName(e.entityName),
        programs: e.programs,
        aliasesJson: e.aliases.map(normalizeSanctionsName),
        country: e.country,
        refreshedAt,
      },
      create: {
        source: "BOOTSTRAP",
        sourceRef: e.sourceRef,
        entityName: e.entityName,
        normalizedName: normalizeSanctionsName(e.entityName),
        entityType: "entity",
        programs: e.programs,
        aliasesJson: e.aliases.map(normalizeSanctionsName),
        country: e.country,
        refreshedAt,
      },
    });
    written += 1;
  }
  return written;
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

    // Planted violations on the reviewable invoices so the SP-1 review
    // engine surfaces real DETERMINISTIC flags + a meaningful proposed
    // short-pay in the demo (rate-over-card, out-of-period, non-billable).
    if (inv.id === "inv-snowflake-005") {
      const priorPeriod = new Date(inv.periodStart.getTime() - 45 * 24 * 60 * 60 * 1000);
      await prisma.invoiceLineItem.createMany({
        data: [
          { invoiceId: inv.id, timekeeperId: "p-tk-skadden-partner", hours: 6, rate: 1650, description: "Emergency counterparty call and negotiation strategy", date: inv.periodStart, status: "PENDING" as never },
          { invoiceId: inv.id, timekeeperId: "p-tk-skadden-partner", hours: 3, rate: 1450, description: "Prior-month diligence review carried into this bill", date: priorPeriod, status: "PENDING" as never },
          { invoiceId: inv.id, timekeeperId: "p-tk-skadden-senior", hours: 4, rate: 1100, description: "Clerical filing documents and photocopying exhibits", date: inv.periodStart, status: "PENDING" as never },
        ],
      });
    }
    if (inv.id === "inv-snowflake-006") {
      await prisma.invoiceLineItem.create({
        data: { invoiceId: inv.id, timekeeperId: "p-tk-axiom-senior", hours: 5, rate: 525, description: "Contract review billed above the agreed ALSP card rate", date: inv.periodStart, status: "PENDING" as never },
      });
    }
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

/** Upsert all 8 canonical roles with their full permission bundles.
 * Shared by the demo seed (§7) and the production-foundation seed. No
 * demo users — just the role catalog so RBAC works. */
async function seedRoles(orgId: string): Promise<number> {
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
  return rolesWritten;
}

async function seedRolesAndTestUsers(orgId: string) {
  // 1. Upsert every canonical role with the full ROLE_PERMISSIONS list.
  //    For admin this overwrites Step 2's 20-string seed with the
  //    canonical 37-string superset.
  const rolesWritten = await seedRoles(orgId);

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
