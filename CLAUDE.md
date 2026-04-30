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

PR #1 (this PR) — Turborepo + Next.js + module structure.
PR #2 — Postgres + Prisma + full shared entity schema. (Step 2)
PR #3 — Auth0 + RBAC + permission enumeration. (Step 3)
PR #4 — Matter Management module with Legal Hold. (Step 4)
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

| Site | Direction | Why allowed |
|---|---|---|
| `packages/db/prisma/seed.ts` | imports `modules/intake/src/seed/{v72-seed,v8-cockpit-seed,v8-bulk-nda-seed}.js` | Dev-only seed script reading its own input. Runs at `pnpm db:seed` time only — never bundled, never imported by app code. The v8 demo fixtures are the canonical demo dataset; duplicating them inside `packages/db` would create two sources of truth. |

### When this pattern is allowed
- **Build-time / dev-only tooling.** Seed scripts, codegen, fixtures
  that the app does not import at runtime.
- **The script reads its own legacy input.** The Step 5 refactor
  moves the v8 fixtures' canonical home; until then, the seed reads
  the existing location.
- **Each crossing is per-line, with a prose justification.** No
  blanket disables. No file-level disable. No directory-level disable.

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

If you find yourself wanting a fourth exception, **stop and ask** —
the right answer is almost always "promote the shared bit into a
package" or "add it to the module's `api.ts`."

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

## Permission model (placeholder)

Step 3 (PR #3) will replace this section with the canonical `Permission`
enumeration. Until then, the demo runs as a single user with full access.

---

## Audit log discipline (placeholder)

Step 2 (PR #2) introduces the `AuditLog` entity. From PR #2 onwards, every
state-changing path must call `logAudit()` from `@aegis/db`. Every PR after
Step 2 must include audit log entries for the mutations it adds.

---

## What's new in PR #1 (this PR)

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
