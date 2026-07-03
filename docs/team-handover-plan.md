# AEGIS — Team Handover & Infrastructure Transfer Plan

How a new engineering team takes full ownership of AEGIS: the code,
the running production stack (Vercel + Neon + Auth0 + Anthropic), the
CI, and the working practices. Everything is transferable — nothing is
tied to a personal machine. Two strategies exist per asset:
**transfer-in-place** (keep the running thing, move ownership) or
**recreate** (stand up fresh under team accounts and cut over). The
recommended mix is marked ✦.

Version 1.0 · 2026-07-03

---

## 1 · What the team is taking over

| Asset | Today | Contains |
|---|---|---|
| **GitHub repo** `Letscode82/aegis` | personal account | all code, issues (#1–#148 history), Actions workflows (CI, db-integrity, Deploy migrations, smoke test) |
| **Vercel project** | personal team | the production deployment (`aegis-eight-roan.vercel.app`), env vars, build-command override, (optionally) Blob store |
| **Neon project** | personal account | prod Postgres — schema (30+ migrations), seed data, the append-only chain-sealed AuditLog |
| **Auth0 tenant** | personal | the application (client id/secret), user connections, (optionally) the Entra enterprise connection |
| **Anthropic API key** | personal | powers `/api/claude` (Claude triage + agent drafts) |
| **Optional** | — | M365 dev tenant creds (matter-module Graph features), Teams outgoing-webhook secret, intake mailbox |

**Read-first docs (in order):** `CLAUDE.md` (the working rules — the
architecture is enforced, not suggested), `PRODUCT.md`,
`docs/intake-roadmap.md`, `docs/intake-worldclass-backlog.md` (all 22
items shipped), `docs/uat-intake-e2e.md`, `docs/market-benchmark-2026.md`,
`docs/entra-sso-onboarding.md`, `docs/m365-ediscovery-onboarding.md`.

---

## 2 · Transfer plan per asset

### 2.1 GitHub repository — ✦ transfer-in-place

Repo transfer preserves issues, PR history, Actions, and stars;
redirects from the old URL are automatic.

1. Team creates a GitHub **organization** (recommended over a personal
   account) and enables Actions.
2. Old owner: repo → Settings → General → **Transfer ownership** → the
   org. (Or: add team members as admins first, transfer later — both fine.)
3. **Secrets/variables do NOT transfer.** Re-create under the new org:
   - Secret `PROD_DATABASE_URL` — the **direct (non-pooler)** Neon URL
     (the auto-migrate workflow uses it on pushes to `main`).
   - Variable `PRODUCTION_URL` — the prod domain (smoke-test workflow).
4. Re-protect `main`: require the `ci` and `db-integrity` checks
   before merge (they are the load-bearing gates — db-integrity replays
   every migration from scratch and verifies the audit chain).
5. Update the Vercel Git connection (2.2) to point at the new repo home.

*Recreate alternative:* fork/push-mirror to a new repo — loses issue/PR
history; only do this if the org forbids transfers.

### 2.2 Vercel project

Two workable paths:

**A · Transfer-in-place** — Vercel supports moving a project between
teams (Project → Settings → General → Transfer). Env vars and domains
move with it; the Git connection must be re-linked if the repo moved.

**B · Recreate — ✦ recommended** (clean ownership, ~30 min):
1. Team Vercel account → **Add New Project** → import the (transferred) repo.
2. Settings that are NOT in the repo and must be re-entered:
   - **Build Command (override):**
     `pnpm --filter @aegis/db exec prisma generate && turbo run build`
   - **Root Directory:** `apps/web`
   - **Node.js version:** 24.x
3. Enter all env vars from §3 (Production + Preview scopes).
4. **Blob store:** Storage → create a Blob store → connect (injects
   `BLOB_READ_WRITE_TOKEN`). Files uploaded to the old store do not
   move automatically — if any real uploads exist, copy them
   (list + re-`put`) or accept the loss for demo data. Document rows
   keep the old URLs; old-store URLs die when the old project is deleted.
5. Deploy → verify §5 → move the custom domain (if any) → decommission
   the old project.

### 2.3 Neon (Postgres) — ✦ transfer-in-place

The database is the one asset where recreation loses something real:
the **append-only AuditLog chain** is the compliance story; dump/restore
preserves it, but in-place transfer is simpler and zero-risk.

**A · Transfer-in-place (recommended):** Neon supports project
transfer to an organization (Neon console → Project → Settings →
Transfer, or via support). Team members get access through the Neon org.
Connection strings stay identical → zero app changes, zero downtime.

**B · Recreate + restore:**
1. New Neon project (same Postgres major version).
2. `pg_dump --no-owner --format=custom "<old-direct-url>" > aegis.dump`
   then `pg_restore --no-owner -d "<new-direct-url>" aegis.dump`.
   This carries schema + data + the audit-chain triggers/functions.
   Verify the chain afterwards: run the `@aegis/db` verify (Audit Log →
   Verify in the UI, or `packages/db/scripts/audit-canary.ts`).
3. *(Fresh-start alternative, demo data disposable):* new project →
   `pnpm --filter @aegis/db exec prisma migrate deploy` → `pnpm db:seed`
   with `SEED_ADMIN_EMAIL`/`SEED_ADMIN_NAME` set to a real team admin.
4. Update `DATABASE_URL` (pooled, in Vercel) + `PROD_DATABASE_URL`
   (direct, in GitHub secrets). **Rule that has bitten before:** the
   app uses the **pooled** URL; `prisma migrate deploy` must use the
   **direct** URL.

### 2.4 Auth0 — ✦ recreate (tenants are not transferable between accounts)

Auth0 tenant *membership* can be extended (Tenant Settings → Members →
invite team admins), which is the fastest continuity path. For clean
ownership, recreate:

1. New tenant → Applications → **Regular Web Application**.
2. Allowed Callback URLs: `https://<domain>/api/auth/callback`;
   Allowed Logout URLs: `https://<domain>`.
3. Copy the five values into Vercel env (§3): `AUTH0_SECRET` (generate:
   `openssl rand -hex 32`), `AUTH0_BASE_URL`, `AUTH0_ISSUER_BASE_URL`,
   `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`.
4. Users: seeded demo users authenticate by email match — create Auth0
   users with the same emails, or rely on SSO + JIT (§2.6). The
   production admin must match `SEED_ADMIN_EMAIL`.
5. If the Entra enterprise connection exists, recreate it per
   `docs/entra-sso-onboarding.md` and set `AUTH0_ENTERPRISE_CONNECTION`.

Note: the module-load production guard **fails the deploy** if
`AUTH0_SECRET` is missing in production — that's intentional; don't
work around it.

### 2.5 Anthropic — recreate (2 min)

Team creates its own console account → new API key → set
`ANTHROPIC_API_KEY` in Vercel → revoke the old key. Without the key the
app still runs (regex classifier + deterministic agent fallbacks) — a
missing key is degraded, not broken.

### 2.6 Optional integrations

| Integration | Action |
|---|---|
| **Teams channel** | New outgoing webhook in the team's Teams tenant → its security token into `AEGIS_TEAMS_WEBHOOK_SECRET`. |
| **Email webhook** | Generate a fresh shared secret → `AEGIS_EMAIL_WEBHOOK_SECRET`; point the mail gateway at `/api/intake/email-webhook`. |
| **M365 / Graph (matter module + intake mailbox)** | Follow `docs/m365-ediscovery-onboarding.md` against the team's dev tenant: app registration → `M365_TENANT_ID` / `M365_CLIENT_ID` / `M365_CLIENT_SECRET`, then re-run the delegated Device-Code connect in `/admin/m365`. Per-org credentials stored in the DB use the dev-grade `encryptSecret` (v1 plaintext — documented sunset before first paying customer): rotate them after handover. |
| **Entra SSO** | `docs/entra-sso-onboarding.md` end-to-end. |

---

## 3 · Environment variable inventory (complete)

### Vercel — Production (+ Preview)

| Var | Required? | Purpose |
|---|---|---|
| `DATABASE_URL` | **yes** | Neon **pooled** connection string (app runtime) |
| `AUTH0_SECRET`, `AUTH0_BASE_URL`, `AUTH0_ISSUER_BASE_URL`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` | **yes** (prod fails loud without) | Auth0 session + login |
| `ANTHROPIC_API_KEY` | recommended | Claude triage/drafts (absent → regex/deterministic fallbacks) |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME` | **yes** for prod seed | the real admin identity the seed writes (see CLAUDE.md warning) |
| `AEGIS_EMAIL_WEBHOOK_SECRET` | if email channel used | inbound email auth (fail-closed) |
| `AEGIS_TEAMS_WEBHOOK_SECRET` | if Teams channel used | Teams HMAC token (fail-closed) |
| `BLOB_READ_WRITE_TOKEN` | auto (Blob store connect) | 25 MB direct uploads |
| `AUTH0_ENTERPRISE_CONNECTION` | if SSO | direct-to-Entra login |
| `AEGIS_SSO_AUTO_PROVISION_DOMAINS` | if SSO JIT | comma-separated allowlist |
| `AEGIS_APP_URL` | optional | links inside notification emails |
| `AEGIS_SLOW_REQUEST_MS`, `AEGIS_SLOW_QUERY_MS` | optional | observability thresholds (2000/500 defaults) |
| `M365_TENANT_ID`, `M365_CLIENT_ID`, `M365_CLIENT_SECRET` | if Graph used | matter-module M365 (partial set crashes prod build by design) |
| `AEGIS_ENCRYPTION_KEY` | if per-org M365 creds used | secret-wrapping key (dev-grade scheme; see sunset) |
| `NOTICE_ACK_LINK_BASE` | optional | legal-hold ack link base for notices |
| `NEXT_PUBLIC_AEGIS_DEMO_AGENTS` | optional | force demo agents visible in prod |

### GitHub Actions (new org)

| Kind | Name | Purpose |
|---|---|---|
| Secret | `PROD_DATABASE_URL` | **direct** Neon URL — auto `migrate deploy` on `main` |
| Variable | `PRODUCTION_URL` | prod domain — daily + on-push smoke test |

### Local dev (`.env.local` — never committed)

`DATABASE_URL` (local docker Postgres), optional `ANTHROPIC_API_KEY`,
optional `DEV_USER_EMAIL` (preview any seeded persona; no Auth0 needed
locally), optional `AEGIS_SEED_PROFILE`.

---

## 4 · Security handover checklist (do ALL of these)

- [ ] **Rotate the Neon password** (it appeared in a chat once) — new
      credential lives ONLY in Vercel env + GitHub secret.
- [ ] Rotate / re-issue: Anthropic key, both webhook secrets,
      `AUTH0_SECRET` and the Auth0 client secret, M365 client secret
      (if used) + re-run the delegated connect.
- [ ] Delete the leftover `PROD_DATABASE_URL` **Variable** in GitHub if
      it still exists (only the encrypted **Secret** should).
- [ ] Old owner removes personal access after the team verifies §5:
      GitHub, Vercel, Neon, Auth0, Anthropic.
- [ ] Confirm no secrets in the repo: `gitleaks` or GitHub secret
      scanning on the new org.

---

## 5 · Post-transfer verification (30 min)

1. `GET https://<domain>/api/health` → 200; smoke-test workflow green.
2. Login via Auth0 (and SSO if configured) as the admin → staff nav renders.
3. File a ticket end-to-end: New Request → agent recommendation →
   Cockpit approve → matter spawn toast → Ticket Timeline complete.
4. Audit Log → **Verify** → chain valid (proves the DB move kept the ledger).
5. Push a trivial commit to `main` → CI + db-integrity + Deploy
   migrations + smoke all green under the new org.
6. Run UAT Suite 1 + Suite 2 from `docs/uat-intake-e2e.md` as a sanity pass.

---

## 6 · Developer onboarding (each engineer, ~1 hour)

```bash
git clone <new-repo-url> && cd aegis
corepack enable                  # pnpm pinned via packageManager
pnpm install
docker compose up -d             # local Postgres
cp .env.example .env.local 2>/dev/null || true   # set DATABASE_URL
pnpm --filter @aegis/db exec prisma migrate deploy
pnpm db:seed
pnpm dev                         # apps/web on :5173, runs as seeded admin
pnpm build && pnpm lint && pnpm typecheck && pnpm test
```

**Working rules the team inherits (enforced, not aspirational):**
- `CLAUDE.md` is law: 11 locked modules, module-isolation ESLint rule
  (never relax), all data via `@aegis/db`, all AI via `@aegis/ai`,
  every mutation writes a chain-sealed audit row, never UPDATE/DELETE
  AuditLog, conservative-AI approval gates are schema-enforced.
- Migrations: additive, one folder per change; `db-integrity` CI
  replays them from scratch — a migration that breaks the chain blocks
  merge. Prod migrations auto-deploy on `main` via the Action.
- Cadence that worked: one branch per item → local test+typecheck+lint
  (+ full `next build` for UI/route changes) → PR → merge on green
  `ci` + `db-integrity` → per-PR status note. TS server files: verify
  Prisma field names against `schema.prisma` before pushing (tests are
  not typechecked; CI build is the first typechecker).

---

## 7 · Roadmap the team inherits

**Next in line (deliberately deferred, ready to start):**
1. **PR #5** — refactor `modules/intake` into `internal/` + `api.ts`
   (the Step-5 split; the seed's cross-package import sunsets here).
2. **PR #6** — Spend & Counsel module (the `getMatterCostBasisService`
   stub sunsets here).
3. **4d** — Matter/Legal-Hold AI features (unfrozen now that Intake
   P1–P4 shipped): `MockHoldAIClient`, similar-matters keyword
   fallback, and `narrativeMarkdown` all sunset here.
4. Worker runtime (pg-boss) — turns the admin HTTP job triggers
   (SLA scan, defensibility snapshots) into scheduled jobs.
5. Before first paying customer: KMS envelope encryption replaces the
   v1 plaintext secret wrapping (documented exception).

**The full documented-exceptions table** in `CLAUDE.md` lists every
sanctioned shortcut with its sunset condition — treat it as the
tech-debt register.

**Open low-priority item:** issue #45 (matter test-suite diff).
