# Deployment

AEGIS deploys to **Vercel** as a single Next.js app (`@aegis/web`) inside a
pnpm + Turborepo monorepo. Build artifacts come from `apps/web/.next`.

## Vercel dashboard configuration (one-time, manual)

After this PR merges, the existing Vercel project must be reconfigured:

| Setting | Value |
|---|---|
| Framework Preset | **Next.js** |
| Root Directory | **`./`** (repo root, **not** `apps/web`) |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command | `pnpm turbo run build --filter=@aegis/web` |
| Output Directory | `apps/web/.next` |
| Node Version | `20.x` |

`vercel.json` at the repo root duplicates these so Preview deployments and
Production deployments stay in sync. The dashboard is the source of truth
for the **Root Directory** setting only — `vercel.json` cannot override it.

## Required environment variables

| Variable | Scope | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Production + Preview | Server-side key used by `@aegis/ai/proxy`. Never exposed to the client. |

Step 2 will add `DATABASE_URL`. Step 3 will add the `AUTH0_*` variables.

## Local development

```bash
pnpm install
pnpm dev          # runs all `dev` tasks; apps/web starts on port 5173
```

Or scoped to a single workspace:
```bash
pnpm --filter @aegis/web dev
```

## Smoke test the deployed app

1. Visit the production URL — Mission Control should load with the seeded
   briefing card.
2. Hit `/api/health` — should respond `{ "status": "ok" }`.
3. Open the Cockpit, click into a ticket — agent recommendations render,
   approve/edit/reject keyboard shortcuts work.
4. Click "Ask Aurora" — the floating panel opens; if `ANTHROPIC_API_KEY` is
   set, the chat responds; otherwise the heuristic fallback responds.
