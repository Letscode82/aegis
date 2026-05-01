# Deployment

AEGIS deploys to **Vercel** as a single Next.js app (`@aegis/web`) inside a
pnpm + Turborepo monorepo. We let Vercel auto-detect everything — there is
no build-command, install-command, or output-directory override anywhere.

## Vercel dashboard configuration (one-time, manual)

Project Settings → General:

| Setting | Value |
|---|---|
| Framework Preset | **Next.js** *(auto-detected; leave as is)* |
| Root Directory | **`apps/web`** |
| Node.js Version | **20.x** |

Project Settings → Build & Development Settings — **leave every override OFF**:

| Setting | State |
|---|---|
| Build Command | **OFF** (use Vercel default — runs `next build` in the Root Directory) |
| Output Directory | **OFF** (use Vercel default — auto-detects `.next`) |
| Install Command | **OFF** (use Vercel default — auto-detects pnpm via `pnpm-lock.yaml`) |
| Development Command | **OFF** |

Why: with Root Directory set to `apps/web` and the Next.js preset detected,
Vercel runs `next build` from the Root Directory and outputs to `.next` —
exactly what we want. Any `outputDirectory` value in `vercel.json` would
be applied **on top** of the Root Directory, doubling the path
(`apps/web/apps/web/.next`) and failing the deploy.

The repo-root [`vercel.json`](../vercel.json) is now intentionally minimal:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs"
}
```

It declares the framework for clarity and provides a `$schema` for editor
help. It does **not** specify build/install commands or output directory —
those are owned by Vercel's auto-detection.

## Workspace transpilation

Workspace packages (`@aegis/ui`, `@aegis/ai`, `@aegis/intake`, `@aegis/db`)
ship as source (`.js` / `.jsx` / `.ts`). Next.js transpiles them via
[`apps/web/next.config.mjs`](../apps/web/next.config.mjs):

```js
transpilePackages: ["@aegis/ui", "@aegis/ai", "@aegis/intake", "@aegis/db"],
```

`outputFileTracingRoot` in the same config points at the monorepo root so
serverless function bundles include the workspace deps.

## Required environment variables

| Variable | Required for | Scope | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Production | Production + Preview | Server-side key used by `@aegis/ai/proxy`. Never exposed to the client. Without it, `/api/claude` 500s and the Copilot/agents fall back to mocked responses. |
| `DATABASE_URL` | Production | Production + Preview | Postgres connection string. **Use the Neon pooled connection string** for serverless functions. Without it, `/api/intake/storage` 500s and the Cockpit shows no tickets. |
| `AUTH0_SECRET` | Production | Production + Preview | 32-byte hex secret used to encrypt the Auth0 session cookie. Generate with `openssl rand -hex 32`. **Presence of this variable is the binary on/off signal** — when it's set, the app enforces real auth; when absent, dev-mode fallback runs. |
| `AUTH0_BASE_URL` | Production | Production + Preview | Public URL of the deployed app, e.g. `https://aegis.vercel.app`. Used to construct callback URLs. |
| `AUTH0_ISSUER_BASE_URL` | Production | Production + Preview | Auth0 tenant URL, e.g. `https://aegis.us.auth0.com`. |
| `AUTH0_CLIENT_ID` | Production | Production + Preview | Auth0 application client id. |
| `AUTH0_CLIENT_SECRET` | Production | Production + Preview | Auth0 application client secret. |
| `SEED_ADMIN_EMAIL` | Production (required); optional in dev/preview | Production + Preview | Email address the seed writes onto the admin User row. **Must match the email the admin signs into Auth0 with**, or `getResolvedUser()` won't find the User and the dashboard appears empty. Defaults to `alex.nguyen@aegis-demo.example` (a non-routable demo domain) when unset — fine for dev/CI, never for production. Read by `pnpm --filter @aegis/db db:seed`; idempotent across changes (rewrites the existing row by name). |
| `DEV_USER_EMAIL` | Optional (dev only) | Local `.env` | Override which seeded test user the dev-mode fallback resolves. Defaults to `alex.nguyen@aegis-demo.example` (admin). Set to e.g. `lena.attorney@aegis-demo.example` to preview the demo as an attorney. Has no effect when Auth0 is configured. |

### Dev-mode fallback (no Auth0)

If any of the five `AUTH0_*` variables is missing or empty, the app runs
in **dev-mode fallback**:

- The middleware is a transparent pass-through — no redirects.
- `/api/auth/login` returns a deterministic JSON describing the
  disabled state (instead of crashing the SDK on init).
- `/api/auth/current-user` resolves the seeded admin (Alex Nguyen) or
  whichever user `DEV_USER_EMAIL` points at.
- `useCurrentUser()` returns the same `AuthUser` shape — UI doesn't
  branch on the auth state.

This keeps `pnpm dev` working zero-config on a fresh sandbox without
forcing every contributor to provision an Auth0 tenant.

### Auth0 setup (production)

1. Create an Auth0 application — type "Regular Web Application",
   allowed callback URL `https://<your-domain>/api/auth/callback`,
   allowed logout URL `https://<your-domain>`.
2. Generate a session secret:
   ```bash
   openssl rand -hex 32
   ```
3. Add the five `AUTH0_*` variables to Vercel (Production + Preview):
   ```
   Project → Settings → Environment Variables
     AUTH0_SECRET            = <output of openssl rand -hex 32>
     AUTH0_BASE_URL          = https://<your-vercel-domain>
     AUTH0_ISSUER_BASE_URL   = https://<your-tenant>.us.auth0.com
     AUTH0_CLIENT_ID         = <from Auth0 dashboard>
     AUTH0_CLIENT_SECRET     = <from Auth0 dashboard>
     Scope: Production + Preview
   ```
4. Redeploy. Anonymous requests to anything other than `/api/health`,
   `/api/auth/*`, and Next.js internals now redirect to
   `/api/auth/login`, which kicks off the Auth0 flow.

The next sign-in by an unknown email currently returns null in
`/api/auth/current-user` (Step 3 keeps this strict — the seed owns the
canonical user list). A "first-login provisioning" flow is on the
backlog for a later step.

### DATABASE_URL setup (Neon)

1. Create a Neon project — region close to the Vercel region the project
   deploys to. Branch: `main`.
2. Create a database called `aegis` (or use the default `neondb`).
3. Copy the **pooled** connection string from the Neon dashboard. It
   ends with `?sslmode=require` and uses the `-pooler` host suffix.
4. Add it to Vercel:
   ```
   Project → Settings → Environment Variables
     Key   : DATABASE_URL
     Value : postgresql://…@ep-…-pooler.…neon.tech/aegis?sslmode=require
     Scope : Production + Preview
   ```
5. Run migrations once against Neon (locally is fine):
   ```bash
   DATABASE_URL=<neon-pooled-url> pnpm --filter @aegis/db db:migrate:deploy
   ```
6. Seed the demo data (optional):
   ```bash
   DATABASE_URL=<neon-pooled-url> pnpm --filter @aegis/db db:seed
   ```

The next deploy after step 4 picks up `DATABASE_URL` automatically.
Without it, the `/api/intake/storage` route 500s — the home page still
renders (the AppShell loads client-side), but ticket data won't appear.

## Local development

```bash
# Bring up local Postgres (one-time per machine, persists in a volume)
docker compose up -d

# Install + generate Prisma client + apply migrations + seed
pnpm install
pnpm --filter @aegis/db db:migrate:dev
pnpm --filter @aegis/db db:seed

# Run the dev server
pnpm dev          # runs all `dev` tasks; apps/web starts on port 5173
```

Or scoped to a single workspace:
```bash
pnpm --filter @aegis/web dev
```

`.env` at the repo root holds `DATABASE_URL` and `ANTHROPIC_API_KEY` for
local dev. A working template lives at `.env.example`.

## Smoke test the deployed app

1. Visit the production URL — Mission Control should load with the seeded
   briefing card.
2. Hit `/api/health` — should respond `{ "status": "ok" }`.
3. Open the Cockpit, click into a ticket — agent recommendations render,
   approve/edit/reject keyboard shortcuts work.
4. Click "Ask Aurora" — the floating panel opens; if `ANTHROPIC_API_KEY` is
   set, the chat responds; otherwise the heuristic fallback responds.

The existing [`smoke-test.yml`](../.github/workflows/smoke-test.yml)
workflow pings `/api/claude` daily and on every push to `main` to catch
key/proxy regressions.
