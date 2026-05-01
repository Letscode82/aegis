# @aegis/db

Prisma client + shared queries. The data layer that every module talks to.
**Postgres only** — local dev runs against the docker-compose Postgres,
production runs against Neon.

## Architectural rule

Every database read or write goes through `@aegis/db`.

- Modules **never** construct their own `PrismaClient`.
- Modules **never** run raw SQL.
- Modules **never** import `@prisma/client` directly — they import the
  generated types and enums via `@aegis/db`.

The one sanctioned exception is documented in
[CLAUDE.md → Documented exceptions](../../CLAUDE.md#documented-exceptions-to-the-module-isolation-rule):
the seed script reads its v8 fixture data from `modules/intake/src/seed/`.
That exception applies to dev tooling only.

## Quickstart (local)

```bash
# 1. Bring up Postgres
docker compose up -d

# 2. Install + generate the Prisma client
pnpm install

# 3. Apply migrations to the local DB
pnpm --filter @aegis/db db:migrate:dev

# 4. Seed the demo dataset
pnpm --filter @aegis/db db:seed

# 5. Run the app
pnpm --filter @aegis/web dev
```

`DATABASE_URL` is read from `.env` at the repo root.
The default for local dev:

```
DATABASE_URL="postgresql://aegis:aegis@localhost:5432/aegis?schema=public"
```

A working `.env.example` is committed at the repo root — copy it to
`.env` (which is gitignored).

## Production setup (Neon)

1. Create a Neon project + a database called `aegis`.
2. Set `DATABASE_URL` in the Vercel project (Production + Preview scopes)
   to the Neon connection string Neon provides — it includes
   `?sslmode=require`. **Use the pooled connection string** for
   serverless functions.
3. Run migrations once on first deploy:
   ```bash
   pnpm --filter @aegis/db db:migrate:deploy
   ```
   Either trigger this from a one-shot deploy hook or run locally
   against the Neon URL.
4. Seed (optional — only if you want demo data in prod):
   ```bash
   DATABASE_URL=<neon-url> pnpm --filter @aegis/db db:seed
   ```

The schema is provider-uniform; nothing in this PR is Postgres-specific
beyond the `provider = "postgresql"` line in `schema.prisma`.

## Scripts

| Script | What it does |
|---|---|
| `pnpm db:generate` | Regenerate the Prisma client (`@prisma/client`). Run after editing `schema.prisma`. |
| `pnpm db:migrate:dev` | Create + apply a new migration in dev. Prompts for a name. |
| `pnpm db:migrate:deploy` | Apply pending migrations in prod. No prompts. |
| `pnpm db:push` | Sync schema → DB without writing a migration. Dev-only escape hatch. |
| `pnpm db:seed` | Run `prisma/seed.ts`. Idempotent. |
| `pnpm db:reset` | Drop + re-create + re-migrate + re-seed. Local destructive. |
| `pnpm db:studio` | Launch Prisma Studio (browser DB viewer). |

## Public surface

```ts
import {
  // The singleton — never construct your own
  prisma,

  // Audit log discipline (Differentiator #3)
  logAudit,

  // Multi-tenancy stubs (filled in Step 3 by @aegis/auth)
  getCurrentOrganization,
  getCurrentUser,

  // Generated namespace + types
  Prisma,
  type Organization, type User, type Role,
  type Counterparty, type Person, type Document,
  type Matter, type LegalHold, type IntakeTicket,
  // … every model + every enum

  // Enums
  IntakeSource, IntakeStatus, AgentRecommendationStatus,
  MatterStatus, LegalHoldStatus, // …
} from "@aegis/db";
```

The singleton is hung off `globalThis` so Next.js dev hot-reloads do not
leak connection pools. Logs `error` in prod, `warn`+`error` in dev.

## logAudit

```ts
await logAudit({
  organizationId,
  actorId: user.id,           // null for system / agent actors
  actorType: "USER",          // "USER" | "AGENT" | "SYSTEM"
  action: "intake.recommendation.approved", // dot.notation
  resourceType: "IntakeTicket",
  resourceId: ticket.id,
  beforeJson: { status: "AWAITING_TRIAGE" },
  afterJson:  { status: "CLOSED", triagedAction: "approved" },
  metadata:   { source: "cockpit" },
});
```

The helper is best-effort: failures are logged but never thrown — the
audit write must not roll back the calling mutation. Read the rows back
via the standard Prisma client:
`prisma.auditLog.findMany({ where: { resourceId } })`.

## Schema overview

The full schema lives at [`prisma/schema.prisma`](./prisma/schema.prisma).
34 tables across 8 sections:

| Section | Tables |
|---|---|
| 1. Generator + datasource | (config) |
| 2. Shared platform | `Organization`, `Role`, `User`, `AuditLog`, `Notification` |
| 3. First-class shared entities | `Counterparty`, `Person`, `Document`, `Obligation`, `Event`, `Tag`, `Tagging` |
| 4. Matter Management + Legal Hold | `Matter`, `MatterParty`, `MatterTimeline`, `MatterTag`, `LegalHold`, `HoldNotice`, `HoldAttestation`, `PreservationOrder` |
| 5. Legal Intake | `IntakeTicket`, `AgentRecommendation`, `IntakeConversation` |
| 6. Spend & Counsel | `Vendor`, `Invoice`, `InvoiceLineItem`, `Budget`, `Timekeeper` |
| 7. Privacy & Compliance Operations | `DataSubjectRequest`, `DSARDataLocation`, `ConsentRecord`, `DataProcessingActivity`, `PrivacyIncident` |
| 8. UserPreference | `UserPreference` (KV for UI state) |

### First-class shared entities (do not re-implement)

`Counterparty`, `Person`, `Document`, `Obligation`, `Event`, `Tag`,
`Tagging`. These live in `@aegis/db` and every module attaches to them.
Inventing `MatterCounterparty`, `ContractParty`, `IntakeDocument`, etc.
is forbidden — the architectural backbone is one entity per concept,
queried from anywhere via `@aegis/db`.

### Polymorphic associations

Several entities are polymorphic on `(ownerType, ownerId)` — `Document`,
`Tagging`, `Obligation`, `Event`. There is **no** foreign key on the
polymorphic owner; the owning module's queries resolve the link. This
keeps the entity reusable across modules without per-module FK columns.

### IntakeTicket id format

Tickets keep human-readable `REQ-NNNN` ids (not cuid) because they
appear in URLs, logs, and the Cockpit UI. Subsequent tickets created
from Copilot get the next available number; brand-new ids are the
client's responsibility (the v8 hook generates them).

## Demo seed

`prisma/seed.ts` is idempotent and runs in 6 sections (each
commit-aligned with the Step 2 history):

1. Organization + admin Role + User + Alex Nguyen Person
2. Counterparties (10), requester Persons (17), demo Tags (5)
3. Matters (3) + Legal Hold sub-domain (1 hold, 2 custodians, 1 attestation, 2 preservation orders)
4. Intake tickets (23) + AgentRecommendation (13) + IntakeConversation (10) — read at runtime from `modules/intake/src/seed/*.js`
5. Spend — 3 vendors, 4 timekeepers, 6 invoices (12 line items, 1 flagged anomaly), 2 budgets
6. Privacy — 1 DSAR (3 data locations), 1 consent record, 2 ROPA entries, 1 incident

Re-running the seed against an already-seeded DB is a no-op (counts
unchanged, except for the deletes/recreates of recommendation +
conversation rows which churn deterministically).

## Production seed

The seed is **safe to run against production** with one configuration
step: set `SEED_ADMIN_EMAIL` to the real email the admin will sign in
with through Auth0.

| Mode | `SEED_ADMIN_EMAIL` | Admin User row |
|---|---|---|
| Local dev / CI | unset | email = `alex.nguyen@aegis-demo.example` (the demo-only fallback) |
| Production / preview | set to a real address | email = the value of `SEED_ADMIN_EMAIL` |

```bash
# Production rollout, same flow as PR #10/#11/#13:
cd apps/web
pnpm dlx vercel env pull .env.production
export $(grep -v '^#' .env.production | xargs)
cd ../..

# DATABASE_URL is the Neon pooled URL; SEED_ADMIN_EMAIL was set in
# the Vercel dashboard alongside the AUTH0_* vars.
pnpm --filter @aegis/db db:seed
```

### Why this matters

`@aegis/auth/server.getResolvedUser()` looks up the User row by the
session's email address. If the seeded admin's email doesn't match
the email the admin signs in with on Auth0, the session resolves to
`null` and the dashboard appears empty. Setting `SEED_ADMIN_EMAIL`
to the same address prevents the mismatch.

### Idempotency across email changes

The seed identifies the admin User by `name === "Alex Nguyen"` within
the demo org rather than by email, so changing `SEED_ADMIN_EMAIL`
between runs **rewrites the existing row's email** instead of creating
a duplicate User. The Alex Person row uses the stable id
`demo-person-alex` and gets the same email applied.

```sql
-- Verified:
SELECT count(*) FROM "User" WHERE name = 'Alex Nguyen';
-- → 1, regardless of how many times the seed runs with different SEED_ADMIN_EMAIL values
```

### Bootstrapping a new tenant

If you're seeding a fresh Neon database for a new prospect/customer:

```bash
DATABASE_URL=<their-neon-url> SEED_ADMIN_EMAIL=their.gc@theircompany.com \
  pnpm --filter @aegis/db db:seed
```

Then the admin's first Auth0 login (with `their.gc@theircompany.com`)
resolves to the seeded admin User and immediately sees the demo data.
A future "first-login provisioning" flow will replace this hand-seed
once we ship multi-tenant onboarding.

## Reset workflow

To wipe the DB and start clean:

```bash
pnpm --filter @aegis/db db:reset
```

This runs `prisma migrate reset --force`, which drops the database,
re-applies all migrations, and re-runs `prisma/seed.ts`. Use it freely
in dev — it is destructive only against the local Postgres container.
