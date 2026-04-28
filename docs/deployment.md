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

Workspace packages (`@aegis/ui`, `@aegis/ai`, `@aegis/intake`) ship as
source (`.js` / `.jsx`). Next.js transpiles them via
[`apps/web/next.config.mjs`](../apps/web/next.config.mjs):

```js
transpilePackages: ["@aegis/ui", "@aegis/ai", "@aegis/intake"],
```

`outputFileTracingRoot` in the same config points at the monorepo root so
serverless function bundles include the workspace deps.

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

The existing [`smoke-test.yml`](../.github/workflows/smoke-test.yml)
workflow pings `/api/claude` daily and on every push to `main` to catch
key/proxy regressions.
