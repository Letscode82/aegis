# @aegis/db

Prisma client + shared queries. **Empty in Step 1.** Populated in Step 2 (PR #2).

## Step 2 will add
- Prisma schema covering the shared platform entities (`Organization`, `User`,
  `Role`, `AuditLog`, `Notification`) and the cross-module first-class
  entities (`Counterparty`, `Person`, `Document`, `Obligation`, `Event`,
  `Tag`, `Tagging`).
- Module-specific schemas for Matter (incl. Legal Hold), Intake, Spend,
  Privacy.
- SQLite for local dev, Postgres (Neon recommended) for production.
- `getPrismaClient()` singleton, `logAudit()` helper, seed scripts.
- Migration tooling.

## Architectural rule
Every database read or write goes through `@aegis/db`. Modules **never**
construct their own `PrismaClient` and **never** issue raw SQL.
