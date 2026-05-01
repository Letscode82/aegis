# CLAUDE.md — Working rules for Claude Code sessions in this repo

> Read this and [PRODUCT.md](./PRODUCT.md) before changing anything. The two
> documents together encode the architectural commitments that future
> sessions must honor.

## Mission, in one paragraph

AEGIS is a legal operations platform for Fortune 50 General Counsel. It
ships as a Turborepo monorepo: one Next.js app at `apps/web`, shared
infrastructure in `packages/*`, and product modules in `modules/*`. The
differentiator is **one brain across legal operations** — every module
queries the same Postgres database via shared entities. Conservative AI
governance is a hard requirement: every AI-generated action gates on human
approval and writes an `AuditLog` entry.

---

## The non-negotiables

1. **The 11 modules are locked.** See PRODUCT.md. Never propose a 12th.
   Never split one. If something doesn't fit, stop and ask.
2. **Module isolation rule is load-bearing.**
   - `modules/<m>` imports from `packages/*` or `modules/<other>/api.ts`.
   - `modules/<m>` **never** imports from `modules/<other>/internal/**` or
     `modules/<other>/src/**`.
   - `apps/web` may import from anywhere (composition root).
   - `packages/*` may **not** depend on `modules/*` or `apps/*`.
   - Enforced by `eslint-plugin-import`'s `no-restricted-paths` rule in
     `packages/eslint-config/module-isolation.cjs`. **Never relax this.**
3. **Shared entities are not re-implemented.** `Counterparty`, `Person`,
   `Document`, `Obligation`, `Event`, `Tag`, `Tagging` live in `@aegis/db`
   and every module attaches to them. Never create
   `MatterCounterparty`, `ContractParty`, etc.
4. **All data access through `@aegis/db`.** Modules never construct their
   own `PrismaClient` and never run raw SQL outside `packages/db`.
5. **All AI calls through `@aegis/ai`.** Modules never `fetch` Anthropic
   directly — they call `callClaude` / `callClaudeJSON`, which routes
   through `/api/claude` so the API key never leaves the server.
6. **The demo never breaks.** Every PR keeps the v8 Intake demo working
   end-to-end (Mission Control briefing, Cockpit, Copilot, all 6 agents,
   approve/edit/reject keyboard shortcuts, "Ask Aurora" panel).
7. **Conservative AI governance.** Every AI action that mutates state
   requires human approval **and** writes an `AuditLog` entry. This is
   not optional and not a future feature — it is the product.

---

## Repository layout

```
apps/web/          Next.js 14 (Pages Router). Composition root.
packages/
  ui/              Aurora tokens + shared atoms
  types/           Cross-cutting TypeScript types
  ai/              Claude client + serverless proxy
  db/              Prisma schema + queries           (filled in Step 2)
  auth/            Auth0 + RBAC                      (filled in Step 3)
  workflow/        Cross-module workflow primitives  (stub)
  documents/       Shared document storage           (stub)
  search/          Cross-module search               (stub)
  identity-graph/  Person/Counterparty graph         (stub)
  eslint-config/   Shared ESLint + module-isolation rule
modules/
  intake/          Bulk-moved in Step 1; api.ts split in Step 5
  (matter/, spend/, … added in Steps 4–6)
reference/aegis-v7-aurora.jsx   Preserved monolith. Read-only.
```

### Module internal layout (post-Step 5)

```
modules/<m>/
├── api.ts          PUBLIC. The only file other modules can import from.
├── package.json
├── src/
│   ├── internal/   PRIVATE. Queries, services, validators, sub-domains.
│   └── ui/         PRIVATE. React components.
└── tests/
```

Step 1 ships `modules/intake` as a single mass under `src/`. Step 5 will
split it into `internal/` + `ui/` + `api.ts`. Until that PR lands, no other
module should import from `@aegis/intake`.

### Shared packages — what each one owns

| Package | Owns |
|---|---|
| `@aegis/ui` | Aurora tokens (`C`, `F`, `M`, `SR`), keyframes, atoms |
| `@aegis/types` | Branded IDs, `Page<T>`, `Result<T,E>`, ISO time strings |
| `@aegis/ai` | Claude client + server proxy + regex classifier |
| `@aegis/db` | Prisma client singleton, shared entity types, `logAudit()` |
| `@aegis/auth` | Auth0 wiring, `Permission` enum, `canUserDo()` |
| `@aegis/workflow` | Workflow definitions + execution engine *(stub)* |
| `@aegis/documents` | Document storage / versioning / retention *(stub)* |
| `@aegis/search` | Cross-module index + query *(stub)* |
| `@aegis/identity-graph` | Person resolution + Counterparty hierarchy *(stub)* |

---

## Foundation plan checkpoints

PR #1 — Turborepo + Next.js + module structure.
PR #2 — Postgres + Prisma + full shared entity schema. (Step 2)
PR #3 — Auth0 + RBAC + permission enumeration. (Step 3)
PR #4 — Matter Management module — split into four sub-PRs:
  4a — Matter foundation: CRUD, state machine, tasks, AuditLog
       chain (D11), reporting, M365 + AI behind mocked interfaces.
  4b — Legal Hold workflow (issue, attest, release, custodian view).
  4c — M365 Graph API client replaces the 4a mock; folders, Teams
       channels, mail rules auto-provision on matter create.
  4d — AI features: matter creation suggestions, similar matters,
       custodian discovery, draft generation. Real Claude calls
       replace the 4a keyword/static fallbacks.
PR #5 — Refactor Intake into internal/api split. (Step 5)
PR #6 — Spend & Counsel module + cross-module flow. (Step 6)

Each step lands as **one PR**, with the demo still working end-to-end at
every checkpoint.

---

## Documented exceptions to the module-isolation rule

The ESLint `no-restricted-paths` rule is load-bearing. The exceptions
below are the **only** sanctioned crossings of the module ↔ packages
boundary. Any new exception requires an entry in this table and a
prose comment at the disable site explaining the rationale.

**Every exception requires either an explicit sunset condition OR a
permanent justification. No exception is open-ended.** The "Sunset"
column is the architectural commitment for retiring the cross-cutting
import. If a new exception has neither a sunset nor a defensible
permanent justification, it does not belong in this table — promote
the shared bit into a package or add it to the module's `api.ts`.

| Site | Direction | Why allowed | Sunset / permanent? |
|---|---|---|---|
| `packages/db/prisma/seed.ts` | imports `modules/intake/src/seed/{v72-seed,v8-cockpit-seed,v8-bulk-nda-seed}.js` | Dev-only seed script reading its own input. Runs at `pnpm db:seed` time only — never bundled, never imported by app code. The v8 demo fixtures are the canonical demo dataset; duplicating them inside `packages/db` would create two sources of truth. | **Sunset at Step 5.** The Intake `internal/api` split absorbs the v8 fixtures into the module's public surface; the seed will then read from `@aegis/intake/api` instead, ending the cross-package import. |
| `packages/db/prisma/seed.ts` | imports `packages/auth/src/roles` via the relative path `../../auth/src/roles` | Same dev-only seed reads the canonical `ROLE_PERMISSIONS` bundles from `@aegis/auth`. A package-name import would create a turbo-detected cycle (`@aegis/auth` depends on `@aegis/db` at runtime). The relative path skips the `package.json` edge while still pointing at the single source of truth — duplicating the role bundles inside the seed would drift the moment a permission is added. | **Permanent.** Role definitions live in `@aegis/auth` by design; build-time tooling reaching them via relative path is the cleanest way to keep one source of truth without introducing a circular package dep. Revisit if the cycle goes away (e.g., if `@aegis/auth` ever stops depending on `@aegis/db`). |
| `modules/matter/src/internal/services/m365.ts` | declares `M365Client` interface + `MockM365Client` implementation | The M365 (SharePoint / Teams / Outlook) integration interface ships in 4a so callers (matter create form, document attachment panel) wire against a stable shape. The Graph API client is mocked. | **Sunset at 4c.** The 4c sub-PR replaces `MockM365Client` with the real Graph API client; the interface stays, the implementation changes, no caller moves. |
| `modules/matter/src/internal/services/cross-module.ts:findSimilarMattersService` | keyword-overlap fallback | Keyword overlap is a placeholder so the matter create form's "similar matters" affordance has real-shaped data today. | **Sunset at 4d.** The 4d sub-PR replaces the keyword fallback with a Claude embedding lookup; same return shape (`MatterMatch[]`). |
| `modules/matter/src/internal/services/cross-module.ts:getMatterCostBasisService` | reads `Budget` + sums approved/paid `Invoice` rows directly | Spend module is not yet shipped (Step 6). The matter dashboard / detail view need real-shaped cost-basis data today. | **Sunset at Step 6.** The Spend module's `api.ts` will expose `getMatterSpendSummary(matterId)`; this stub is replaced by a single call into `@aegis/spend`, returning the same `MatterCostBasis` shape with `source: "spend-api"`. |

### When this pattern is allowed
- **Build-time / dev-only tooling.** Seed scripts, codegen, fixtures
  that the app does not import at runtime.
- **The script reads its own legacy input.** The Step 5 refactor
  moves the v8 fixtures' canonical home; until then, the seed reads
  the existing location.
- **Each crossing is per-line, with a prose justification.** No
  blanket disables. No file-level disable. No directory-level disable.
- **The exception has a recorded sunset condition or permanent justification.**
  "We'll fix it later" is not a sunset condition — name the step or
  PR, or admit it's permanent and explain why.

### When this pattern is forbidden
- **Runtime app code.** A page, an API route, a module file, a
  package — anything that ships in `next build`. Even if it's
  "just convenience" or "the data is already there."
- **Citing this exception as precedent.** Each new exception requires
  its own row in the table above, with its own justification.
- **Pulling a module's internals into a package to "shortcut" a
  proper api.ts surface.** That is exactly the architecture this
  rule prevents. Add the public surface to the module's `api.ts`
  instead.
- **Open-ended exceptions.** Without a sunset condition or a permanent
  justification, the exception accrues entropy. Reject it.

If you find yourself wanting a fourth exception, **stop and ask** —
the right answer is almost always "promote the shared bit into a
package" or "add it to the module's `api.ts`."

---

## Auto-create patterns are seed/dev only

Several places in the codebase auto-create a missing reference rather
than fail loudly. For example:

- `packages/db/prisma/seed.ts` (`ensureRequesterPerson`) — creates a
  `p-auto-{slug}` Person row when a v72 ticket's `from` name doesn't
  match a pre-seeded requester.
- `modules/intake/src/storage/server.ts` (`saveTicketsV8`) — same
  fallback when the v8 polyfill receives a brand-new ticket from
  Copilot whose requester isn't yet in the DB.

**This pattern belongs in seed scripts and dev-mode fallbacks only.**
Production migrations and runtime code MUST fail loud on missing
references. The reasoning:

- **Migrations** silently auto-creating missing rows obscure the
  divergence between environments. A migration must be deterministic
  given the same starting state.
- **Runtime app code** auto-creating an entity to satisfy a foreign-key
  constraint hides the real bug — usually upstream input validation
  that should have rejected the request.
- **Audit ledgers** for auto-created rows attribute the action to the
  system actor, which masks the missing-data failure mode.

The right pattern in production code is:

```ts
const requester = await prisma.person.findUnique({ where: { id: requesterId } });
if (!requester) {
  throw new Error(`Person ${requesterId} not found — input validation should have rejected this earlier.`);
}
```

If you need an "auto-create" to make a new code path work, you almost
certainly need an explicit upstream reference instead — a registration
flow, a validation step, or a dedicated provisioning endpoint with its
own audit trail.

### Production seed must use a real, verifiable admin email

The fallback admin email in `packages/db/prisma/seed.ts`
(`alex.nguyen@aegis-demo.example`) is a non-routable demo domain and
exists for local dev / CI only. **Production deployments must set
`SEED_ADMIN_EMAIL`** to the real address the admin will sign in with
through Auth0.

Reasoning:
- `@aegis/auth/server.getResolvedUser()` resolves the User row by the
  Auth0 session's email. A mismatch means the dashboard appears empty
  — the admin sees a "logged in" state but no data, because the seeded
  User row has the demo email and the session has the real one.
- The fallback email is a non-routable domain by design — letting it
  reach a production User row would silently advertise a fake account
  in audit-log surfaces and notification fan-outs.

The seed is idempotent across `SEED_ADMIN_EMAIL` changes: it
identifies the admin User by `name === "Alex Nguyen"` within the demo
org, so changing the env between runs rewrites the existing row's
email instead of creating a duplicate.

---

## House rules for editing this repo

- Use **pnpm** (not npm or yarn). The root `packageManager` field pins it.
- Run `pnpm turbo run <task>` for build / lint / test / typecheck — never
  call workspace scripts directly when crossing package boundaries.
- New modules go under `modules/<name>/` with the `internal/` + `ui/` +
  `api.ts` layout from day one.
- New shared infrastructure goes under `packages/<name>/` and must be
  consumable by any module. If you find yourself needing module-specific
  branches inside a package, you've put it in the wrong place.
- Don't add a 12th module. Don't split an existing module. Don't
  re-implement a shared entity per module.
- Don't relax the ESLint isolation rule. If the rule blocks an import,
  the import is the problem — fix the dependency direction.
- Don't add features beyond what the current step requires. Steps stay
  minimal so checkpoints stay reviewable.

---

## Local development

```bash
pnpm install
pnpm dev              # all packages' dev tasks (apps/web on :5173)
# or scoped:
pnpm --filter @aegis/web dev
```

Build / lint / typecheck / test all packages:
```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

The Claude proxy at `/api/claude` requires `ANTHROPIC_API_KEY` in the
environment. Without it, the regex-based intake classifier and mocked
agents take over so the demo still walks end-to-end.

---

## Permission model (canonical)

The `Permission` enum in `@aegis/auth` is the single source of truth.
Modules do **not** define their own permission strings — they pick from
this list. Renaming an existing value is a breaking change against the
seeded admin role and any production tenant; add new values, never
repurpose existing ones.

### The 37 canonical permissions

| Domain | Permission | Purpose |
|---|---|---|
| Intake | `intake:create_ticket` | File a new intake ticket |
|        | `intake:read_own_tickets` | Read tickets you filed |
|        | `intake:read_all_tickets` | Read every ticket in the org |
|        | `intake:approve_recommendation` | Approve an agent recommendation |
|        | `intake:reject_recommendation` | Reject an agent recommendation |
|        | `intake:close_ticket` | Mark a ticket closed |
| Matter | `matter:read_all` | Read every matter in the org |
|        | `matter:read_assigned` | Read matters where you're a party (resource-scoped) |
|        | `matter:create` | Open a new matter |
|        | `matter:update` | Edit a matter |
|        | `matter:close` | Mark a matter closed |
| Legal Hold | `matter:legal_hold:issue` | Issue a legal hold |
|        | `matter:legal_hold:release` | Release a legal hold |
|        | `matter:legal_hold:custodian_view` | Custodian-side hold view (resource-scoped) |
| Contracts | `contracts:read_all` | Read every contract |
|        | `contracts:create` | Draft a contract |
|        | `contracts:approve` | Approve a contract |
|        | `contracts:execute` | Execute (sign) a contract |
| Spend | `spend:read_all` | Read every invoice |
|        | `spend:read_matter_budget` | Read budget on assigned matter (resource-scoped) |
|        | `spend:approve_invoice` | Approve an invoice |
|        | `spend:reject_invoice` | Reject an invoice |
| Privacy | `privacy:dsar:read` | Read DSARs |
|        | `privacy:dsar:fulfill` | Fulfill a DSAR |
|        | `privacy:dpia:read` | Read DPIAs |
|        | `privacy:dpia:approve` | Approve a DPIA |
|        | `privacy:incident:respond` | Respond to a privacy incident |
| Knowledge | `knowledge:read_all` | Read all knowledge entries |
|        | `knowledge:contribute` | Contribute knowledge entries |
|        | `knowledge:moderate` | Moderate knowledge entries |
| Regulatory | `regulatory:read` | Read regulatory items |
|        | `regulatory:flag_obligation` | Flag a new regulatory obligation |
| Governance | `governance:read` | Read governance materials |
|        | `governance:attest` | Attest to a policy / committee item |
| Audit | `audit:read_all` | Read the platform audit ledger |
| Admin | `admin:manage_users` | Add / remove / edit users |
|        | `admin:manage_roles` | Edit role permission sets |

### The 8 canonical roles

The default permission bundles are in
[`packages/auth/src/roles.ts`](./packages/auth/src/roles.ts). Tenants
may extend any role's permissions through the role-management UI in a
later step; the catalog below is the starting point, not a ceiling.

| Role | Default permissions | Typical user |
|---|---|---|
| `admin` | All 37 (superuser bundle) | Platform owner |
| `gc` | All reads + most writes + audit + manage_users | General Counsel |
| `attorney` | Reads + write within assigned matters | In-house attorneys |
| `paralegal` | All reads + intake/matter writes; no spend approvals | Paralegals |
| `legal_ops` | All reads + audit + budgets + governance attestations | Legal-ops staff |
| `requester` | `intake:create_ticket`, `intake:read_own_tickets` | Filers from any business unit |
| `external_counsel` | Read assigned matters, custodian view, matter budget | Outside firms |
| `viewer` | All reads only | Auditors / observers |

### Resource-scoped permissions

Some permissions imply a scope check beyond the action grant. `canUserDo()`
in `@aegis/auth` enforces both layers:

| Permission | Scope check |
|---|---|
| `matter:read_assigned` | Caller is on the matter's `MatterParty` list |
| `matter:legal_hold:custodian_view` | Caller is a party on the hold |
| `intake:read_own_tickets` | Caller is the ticket's requester |
| `spend:read_matter_budget` | Caller is on the matter's `MatterParty` list |

Any other Permission is org-scope: action check is sufficient.

### Where to call canUserDo

Every gated UI affordance and every server-side mutation. UI checks
(hide a button) and authoritative checks (block the API) both go
through `canUserDo()` — no "trust the client" path. Use
`assertUserCanDo()` server-side; it throws `AccessDeniedError` which
handlers translate to a 403.

---

## Data access discipline

All database reads and writes go through `@aegis/db`. Every module imports
the singleton `prisma` client from there:

```ts
import { prisma, logAudit, getCurrentOrganization, type Matter } from "@aegis/db";
```

- Modules **never** construct their own `PrismaClient` — connection pools
  must be shared.
- Modules **never** issue raw SQL — Prisma migrations are the only path.
- Modules **never** import `@prisma/client` directly — generated types and
  enums come through `@aegis/db`.

Local dev runs against the Postgres brought up by `docker compose up -d`
at the repo root. Production runs against Neon. See
[`packages/db/README.md`](./packages/db/README.md) for the full workflow,
schema overview, and migration tooling.

### First-class shared entities (do not re-implement)

These live in `@aegis/db` and every module attaches to them. Inventing
parallel module-specific tables is forbidden:

- `Counterparty` — companies, individuals, law firms, regulators
- `Person` — humans (employees, external counsel, custodians, data
  subjects, counterparty contacts) — polymorphic on role
- `Document` — files, polymorphic on `(ownerType, ownerId)`
- `Obligation` — commitments sourced from contracts / regulations /
  policies / privacy laws
- `Event` — append-only log feeding timelines, search index, notifications
- `Tag` + `Tagging` — labels with polymorphic many-to-many

If a feature wants `MatterCounterparty`, `ContractParty`, `IntakeDocument`,
etc. — that's a sign of going wrong. Stop and use the shared entity.

## Audit log discipline (Differentiator #3)

Every state-changing path writes an `AuditLog` row via `logAudit()` from
`@aegis/db`. There is no "this mutation is too small to log" exception.

```ts
await logAudit({
  organizationId,
  actorId: user.id,           // or null for system / agent actors
  actorType: "USER",          // "USER" | "AGENT" | "SYSTEM"
  action: "matter.created",   // dot.notation
  resourceType: "Matter",
  resourceId: matter.id,
  beforeJson: null,           // omit for create
  afterJson: { title, type }, // omit for delete
  metadata: { source: "ui" },
});
```

The helper is best-effort — failures log but never throw, so the audit
write cannot roll back the calling mutation.

**Where to call it.** The architecturally correct place is server-side,
inside the mutation chokepoint, *not* in the React component or hook.
The server is the only party that sees the canonical pre-mutation state;
client-side calls can be tampered with. Examples already in the codebase:

- `modules/intake/src/storage/server.ts` writes 5+ canonical audit
  actions (`intake.ticket.created`, `intake.recommendation.approved`,
  `intake.recommendation.edited_approved`, `intake.recommendation.rejected`,
  `intake.recommendation.reassigned`, `intake.recommendation.manual_close`,
  `intake.recommendation.snoozed`, `intake.ticket.escalated`,
  `intake.ticket.closed`) by diffing the incoming payload against
  pre-mutation DB state.

Every PR after Step 2 must include audit log entries for the mutations
it adds. PR #4 (Matter) needs `matter.*` actions. PR #6 (Spend) needs
`spend.invoice.*` actions. Etc.

---

## Architectural Foundations

Cross-cutting commitments that every module inherits. Adding to this
list requires deliberate consensus; relaxing one is a breaking
architectural change.

### AuditLog cryptographic chain (D11)

Every module's mutating operations write to `AuditLog` via
`@aegis/db.logAudit`. The table is **append-only** at the database
level and **cryptographically chained** so post-hoc tampering is
detectable.

**Schema.** Each row carries `chainPosition` (per-organisation 1-indexed
monotonic counter), `prevHash` (SHA-256 of the prior row's
`contentHash` within the same org; 64 zero-bytes for the genesis row),
`contentHash` (SHA-256 of the canonical-content text including
`prevHash` and `chainPosition`), and `schemaVersion` (canonical-content
shape version, currently 1).

**Triggers.** Postgres triggers, installed by migration
`20260501120100_step4a_audit_chain`, enforce three invariants:

- `BEFORE INSERT` runs `audit_log_before_insert()` inside a per-org
  `pg_advisory_xact_lock` so concurrent inserts cannot collide on
  `chainPosition`. The trigger overwrites whatever `prevHash` /
  `contentHash` / `chainPosition` the app sent — apps cannot influence
  these values.
- `BEFORE UPDATE` raises `check_violation` unconditionally.
- `BEFORE DELETE` raises `check_violation` unconditionally.

**Verification.** Tamper detection does **not** depend on the
immutability triggers staying intact. An attacker with superuser could
disable the triggers, but `verifyAuditChain(orgId)` (in `@aegis/db`)
recomputes `contentHash` from the row's stored fields via the same
SQL helper the trigger uses (`audit_log_compute_hash`). Any divergence
localises the break. The CI `db-integrity` job is a **pre-merge
required check**: every PR brings up Postgres, applies all migrations
from scratch, seeds, runs `packages/db/scripts/audit-canary.ts`, and
runs the `@aegis/db` integration suite (`pnpm --filter @aegis/db run
test:db`). A migration or service change that silently invalidates
previously-sealed rows — or that breaks any of the seven chain
invariants the suite asserts — fails the build and blocks merge.

**Defensibility export.** `exportAuditDefensibilityReport(filter)`
produces `{ pdfBuffer, jsonReport }`. The JSON report includes each
row's verbatim `canonicalContent` text — the exact string the trigger
hashed — so off-database auditors can SHA-256 each row and compare to
`contentHash` without reproducing JSONB normalisation. The PDF
embeds the JSON via PDF Info dict (`AegisChainData` base64) **and** as
an embedded file attachment (`aegis-chain-data.json`).

**This is non-negotiable across all 11 modules.** New modules:
- **Never** issue raw SQL against `AuditLog`; always go through
  `logAudit()`.
- **Never** UPDATE or DELETE an `AuditLog` row. To correct a record,
  add a corrective audit row.
- **Never** add `prevHash`, `contentHash`, or `chainPosition` values
  yourself; the trigger fills them.
- Bumping `schemaVersion` requires writing a v2 canoniciser SQL
  function and updating both the trigger and `audit-canary.ts` to
  dispatch on the version. The whole point of `schemaVersion` is so
  prior chain segments stay valid; never re-canonicalise.

### Twin-recording (matter timeline + audit)

In `@aegis/matter`, every state-changing path goes through
`internal/services/timeline.ts:recordMatterEvent()`, which writes both
the `Event`/`MatterTimeline` rows (product surface) **and** the
`AuditLog` row (compliance ledger). This is the canonical pattern
for any new module's mutation chokepoint — module code never writes
one without the other.

---

## Module-load architectural guards

Several invariants are enforced at module-import time so a future edit
that violates them fails fast — at `next build`, at `pnpm typecheck`,
at the first cold start of a serverless function — instead of drifting
silently into production. Adding a new guard here is preferred over
relying on a test or code review to catch the same drift.

| Guard | Where | What it asserts | What trips it |
|---|---|---|---|
| **Permission enum ⊇ seed strings** | `packages/auth/src/permissions.ts` | Every string in `SEED_ADMIN_PERMISSIONS_VERBATIM` (the 20 strings the Step 2 admin role carries) maps to a `Permission` enum value. | Renaming a `Permission` value that the seed depends on. |
| **admin role is the superuser bundle** | `packages/auth/src/roles.ts` | `ROLE_PERMISSIONS.admin.length === Object.values(Permission).length`. | Adding a new `Permission` without granting it to admin. |
| **No silent dev-mode auth in production** | `packages/auth/src/server.ts` | If `NODE_ENV=production` and `AUTH0_SECRET` is unset, the module throws at import — failing the deploy with a clear error instead of letting the dev-mode fallback (every visitor resolves to the seeded admin) silently engage. | Deploying without the five `AUTH0_*` env vars set on the Vercel project. |

These guards run on the first `import` of their module — so any
serverless function bundle that touches the affected package fails
the cold-start, not just one specific entry point. There is no
"forgot to import the guard" path.

When adding a new architectural commitment that future Claude Code
sessions might accidentally violate, prefer a module-load assertion
over a runtime check or a documentation note alone.

---

## Future migrations

Architectural decisions we expect to revisit. Not "TODOs" — actual
forks where the current choice is right for now and will need to
change when a known trigger fires. Each entry names the decision,
the trigger condition, and the rough cost of the swap.

### Auth: Auth0 → enterprise-IdP federation (NextAuth.js)

**Current.** `@aegis/auth` wraps `@auth0/nextjs-auth0` 3.5. Auth0 was
chosen for fast demo setup — one tenant, Universal Login, zero IdP
work for the development team.

**Trigger.** First client contract requiring SSO with their existing
IdP (Microsoft Entra ID, Okta, Ping). Enterprise legal departments
will not run identity through a vendor account they don't control;
SAML/OIDC federation to the client's IdP is table stakes.

**Migration plan.** The `@aegis/auth` package is structured so the
SDK can be swapped without touching modules:

- `Permission`, `RoleName`, `ROLE_PERMISSIONS`, `canUserDo`,
  `assertUserCanDo` are SDK-agnostic. Stay as-is.
- `getResolvedUser(req, res)` is the only function that imports
  `@auth0/nextjs-auth0`. Reimplement with NextAuth.js v5 + a SAML/OIDC
  provider per tenant. Same signature, same `AuthUser` return shape —
  no consumer change.
- `makeAuthHandler()` factory + the `[...auth0]` catch-all become a
  NextAuth `[...nextauth]` route.
- Module-load production guard (`AUTH0_SECRET` unset → throw)
  generalises to "OIDC issuer URL unset → throw".

**Estimated cost.** Half a day of focused work. The architectural
isolation that makes this swap cheap is the reason we picked the
package boundary the way we did, and the reason `@aegis/db.context.ts`
delegates to `@aegis/auth/server.getResolvedUser` rather than calling
the Auth0 SDK directly.

**Until then.** The dev-mode fallback (no `AUTH0_*` env → seeded
admin) keeps `pnpm dev` zero-config, and the production guard prevents
the silent-downgrade footgun. Both stay through the swap.

---

## What's new in PR #4 / sub-PR 4a (Step 4a — Matter foundation + AuditLog chain)

- `modules/matter` ships from day one with the `internal/` + `ui/` +
  `api.ts` split. `api.ts` is the only file other modules can import.
- Matter CRUD + status state machine + numbering + parties + tasks +
  closeout gating + reporting are full implementations. Cross-module
  integration (intake link, counterparty, cost basis, similar
  matters), M365 client interface, and Legal Hold reads are mocked /
  stubbed against stable shapes; see "Documented exceptions" for
  per-mock sunset conditions (4b/4c/4d/Step 6).
- Status state machine — `DRAFT → OPEN → ACTIVE → STAYED → CLOSED →
  ARCHIVED`. Transitions enforced with `IllegalMatterTransitionError`.
  `CLOSED` is gated by the closeout checklist; the helper
  `closeMatter()` is the only path that can cross to CLOSED.
- Numbering — per-(org, type) configurable format on
  `MatterTypeConfig.numberingFormat`. Default `M-{YYYY}-{SEQ:4}`.
  DRAFT matters skip numbering until promoted.
- AuditLog cryptographic chain (D11). See "Architectural Foundations".
  Schema gains `prevHash` / `contentHash` / `chainPosition` /
  `schemaVersion`. Postgres triggers enforce append-only + chain
  consistency. `verifyAuditChain` + `exportAuditDefensibilityReport`
  ship in `@aegis/db`. CI's `db-integrity` job is a pre-merge
  required check — it brings up Postgres, applies migrations, seeds,
  runs the canary script and the integration suite; a chain
  regression blocks merge.
- New permissions, all already in the `Permission` enum from Step 3:
  `matter:read_all`, `matter:read_assigned`, `matter:create`,
  `matter:update`, `matter:close`, `audit:read_all`. Routes in
  `apps/web` are gated through `canUserDo` / `assertUserCanDo`.
- New pages: `/matter` (dashboard), `/matter/list`, `/matter/new`,
  `/matter/[id]` (tabbed detail), `/audit-log`. Aurora design system.
- New API endpoints: `/api/matter/*` (dashboard, list, CRUD,
  transition, close, parties, tasks, timeline, cost-basis,
  legal-holds, audit) + `/api/audit-log` (list, verify, export).
- Seed §3a–3d: `MatterTypeConfig` rows for all 9 matter types,
  closeout checklists snapshotted onto the seeded matters, three
  `MatterTask` rows on the Snowflake matter, and one synthetic
  `system.boot` `AuditLog` row so the CI canary has data.
- CLAUDE.md additions:
  - "Architectural Foundations: AuditLog cryptographic chain (D11)"
    section codifies the D11 commitment.
  - Documented exceptions table grows by three: M365 mock (sunset 4c),
    similar-matter keyword fallback (sunset 4d), Spend cost-basis
    stub (sunset Step 6).
  - Foundation plan checkpoint splits PR #4 into 4a/4b/4c/4d.

## What's new in PR #3 (Step 3 — Auth0 + RBAC + permission model)

- `packages/auth` is no longer empty.
  - `Permission` enum: 37 canonical values, every one of the 20 strings
    the Step 2 admin role carried verbatim — module-load runtime guard
    fails fast if any seed string drifts.
  - 8 canonical roles: `admin`, `gc`, `attorney`, `paralegal`,
    `legal_ops`, `requester`, `external_counsel`, `viewer`. Default
    permission bundles in `roles.ts`. Admin-must-be-superset gate
    asserts `admin.permissions.length === Object.values(Permission).length`
    at module load.
  - `canUserDo(user, permission, resource?)` returns a discriminated
    `AccessDecision` (`{allowed, reason, message}`). Resource-scope
    layer enforces matter-assignment / ticket-ownership / custodian
    membership for the four scoped permissions.
  - `assertUserCanDo()` + `AccessDeniedError` for handler use.
- `@auth0/nextjs-auth0` 3.5 wired in.
  - `apps/web/pages/api/auth/[...auth0].ts` mounts the catch-all.
  - `apps/web/pages/api/auth/current-user.ts` returns the resolved user.
  - `apps/web/middleware.ts` redirects anonymous requests to
    `/api/auth/login` when configured; no-op otherwise.
  - Dev-mode fallback: when `AUTH0_SECRET` is unset, the demo runs as
    the seeded admin (Alex by default; override via `DEV_USER_EMAIL`).
    No login flow, no broken pages — pnpm dev still works zero-config.
  - **Production guard.** `@aegis/auth/server` throws at module load
    if `NODE_ENV=production` AND `AUTH0_SECRET` is unset. The deploy
    fails at function cold-start with a clear error rather than
    silently downgrading to "every visitor is the admin" via the
    dev-mode fallback. See "Module-load architectural guards" above.
- `useCurrentUser()` React hook in `@aegis/auth/react` — returns
  `{ user, loading, error, has(perm), roleName }`. Same shape in both
  modes.
- `@aegis/db` `getCurrentOrganization` / `getCurrentUser` now accept
  optional `(req, res)`. Request-scoped callers delegate to
  `@aegis/auth/server.getResolvedUser`; script callers fall back to
  email lookup. Threaded through `modules/intake/src/storage/server.ts`
  so AuditLog rows attribute to the real session user when one exists.
- Seed §7 — all 8 roles upserted with their full `ROLE_PERMISSIONS`
  bundles (admin grows from 20 → 37 strings); 7 test users (one per
  non-admin role) for previewing the demo through different role
  lenses via `DEV_USER_EMAIL=<email>`.
- CLAUDE.md additions:
  - Full Permission enumeration + role catalog tables.
  - Carryover note 1: "Auto-create patterns are seed/dev only — production
    migrations and runtime code must fail loud."
  - Carryover note 2: "Every documented exception requires either an
    explicit sunset condition or a permanent justification."
  - The Step 1 seed exception now has a sunset (Step 5) recorded.

## What's new in PR #2 (Step 2 — Postgres + Prisma + shared entity schema)

- `packages/db` is no longer empty.
  - Full Prisma schema (`prisma/schema.prisma`) — 34 tables across all
    11 modules, provider = `postgresql`.
  - Initial migration applied (`prisma/migrations/<ts>_init`).
  - `PrismaClient` singleton at `@aegis/db` (hung off `globalThis` so
    Next.js dev hot-reloads do not leak connections).
  - `logAudit()` helper for the canonical AuditLog write path.
  - `getCurrentOrganization()` / `getCurrentUser()` stubs — resolve the
    seeded demo org / user until Step 3 wires Auth0.
- Local dev runs against the Postgres brought up by the repo-root
  `docker-compose.yml`. Prod runs against Neon — same schema, different
  `DATABASE_URL`.
- Demo seed (`prisma/seed.ts`) — idempotent, six commit-aligned sections:
  org+user+role, counterparties+requesters+tags, matters+legal-hold,
  intake tickets (read at runtime from `modules/intake/src/seed/*.js`),
  spend (vendors/invoices/budgets), privacy (DSAR/ROPA/consent/incident).
- `window.storage` polyfill is now Prisma-backed.
  - `modules/intake/src/storage/server.ts` — server-only translation layer
    that maps the v8 demo's storage keys to Prisma queries.
  - `apps/web/pages/api/intake/storage.ts` — thin HTTP wrapper.
  - `modules/intake/src/storage/polyfill.js` — rewritten to fetch the API.
  - React components don't change; `window.storage` interface preserved.
- Audit log discipline implemented end-to-end. Every Intake state
  transition (approve, reject, escalate, close, edit, reassign, …)
  writes an AuditLog row server-side, transparently — there is no path
  through the storage API that misses the ledger.
- `CLAUDE.md` "Documented exceptions" section records the seed's
  `modules/intake/src/seed → packages/db/prisma/seed.ts` cross-package
  import — the only sanctioned crossing of the module-isolation rule.

## What's new in PR #1

- pnpm + Turborepo monorepo.
- Vite → Next.js 14 (Pages Router) migration.
- `apps/web` is the composition root; `/api/claude` and `/api/health` are
  Next.js API routes; `/api/claude` delegates to `@aegis/ai/proxy`.
- `packages/ui`, `packages/ai`, `packages/types` populated.
- `packages/db`, `packages/auth` empty placeholders for Steps 2–3.
- Stub packages `workflow`, `documents`, `search`, `identity-graph` with
  substantive READMEs that lock in their planned scope.
- `packages/eslint-config` with the `no-restricted-paths` module-isolation
  rule applied at the repo root.
- All AI / Intake code bulk-moved into `modules/intake/src/` (single mass —
  no `internal/api` split until Step 5).
- GitHub Actions CI: install + build + lint + typecheck + test.
- `vercel.json` so the existing Vercel project deploys the new layout.
- `reference/aegis-v7-aurora.jsx` restored from `c92b054` as the
  read-only behavioral reference.
