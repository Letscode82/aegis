# AEGIS end-to-end test harness

Automated browser tests (Playwright + Chromium) that exercise the three
feature areas requested — **ONE Legal**, **Legal Intake**, and **Contracts** —
plus a shell/navigation smoke suite. Each run produces a pass/fail report with
a screenshot per feature, and is re-runnable after every change.

> This is the "agent that does most of the testing". It can't judge AI answer
> quality or demo feel — for that, see [`MANUAL-CHECKLIST.md`](./MANUAL-CHECKLIST.md).

## Safety first — it will not touch the live demo

People run live demos against the production/demo database. The suite is built
so a careless run cannot write junk into it:

- **Read-only by default.** Navigation, load, tab, search and presence checks
  create nothing. Run them against any environment safely.
- **Writes are double-gated.** Tests that create or modify data are tagged
  `@mutation` and are **skipped** unless *both*:
  - `E2E_TARGET=test` — you assert the target is a throwaway test DB / org, and
  - `E2E_ALLOW_MUTATIONS=1` — you opt in to running write flows.
- **Login is never changed.** In dev-mode auth (no `AUTH0_*` env) the app
  resolves every visitor to the seeded admin, so there's no login step and the
  tests never alter credentials. For a deployed (Auth0) instance, supply a
  saved session via `E2E_STORAGE_STATE` (see below).

So the worst case of a misconfigured run against the demo is a batch of
read-only page loads.

## Quick start

### Option A — against a throwaway local app (fully isolated, recommended)

Bring up a **test** Postgres (not the demo DB), point the app at it, seed it,
then let Playwright boot the dev server itself:

```bash
# 1. a disposable Postgres (repo already ships a compose file)
docker compose up -d                      # or any test DB
export DATABASE_URL="postgresql://aegis:aegis@localhost:5432/aegis?schema=public"

# 2. schema + demo seed into THAT db
pnpm --filter @aegis/db exec prisma migrate deploy
pnpm --filter @aegis/db exec prisma db seed

# 3. install Playwright's browser deps once (Chromium is already in CI images)
pnpm --filter @aegis/web exec playwright install chromium

# 4. run — Playwright starts `next dev` for you, no login needed (dev-mode auth)
cd apps/web
E2E_START_SERVER=1 E2E_TARGET=test E2E_ALLOW_MUTATIONS=1 pnpm test:e2e
```

### Option B — against an already-running instance (read-only smoke)

Point at a URL that's already up (local or deployed). Leave the mutation flags
off so nothing is written:

```bash
cd apps/web
E2E_BASE_URL="https://your-aegis-instance.example" pnpm test:e2e
```

For a deployed instance that uses Auth0, save a logged-in session once and
reuse it (this never changes the login — it just replays your cookies):

```bash
# one-time: log in interactively and save the state
pnpm --filter @aegis/web exec playwright open --save-storage=.auth/state.json https://your-aegis-instance.example
# then:
E2E_BASE_URL="https://your-aegis-instance.example" \
  E2E_STORAGE_STATE="$(pwd)/.auth/state.json" \
  pnpm test:e2e
```

## Reading the results

After a run:

- **`e2e-report/summary.md`** — compact pass/fail roll-up by feature area, with
  failure messages and the screenshot paths. Paste-able into chat / a PR.
- **`e2e-report/html/index.html`** — the rich report: screenshots, traces and
  videos per test. Open it with `pnpm --filter @aegis/web test:e2e:report`.
- **`e2e-report/results.json`** — machine-readable results.

## Environment variables

| Var | Default | Meaning |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:5173` | App under test. |
| `E2E_START_SERVER` | *(unset)* | `1` → Playwright boots `next dev` itself (local only; needs a test `DATABASE_URL`). |
| `E2E_STORAGE_STATE` | *(unset)* | Path to a saved Playwright storage-state file (deployed Auth0 instance). |
| `E2E_TARGET` | *(unset)* | `test` → you declare the target is a throwaway DB/org (required for writes). |
| `E2E_ALLOW_MUTATIONS` | *(unset)* | `1` → run `@mutation` tests (requires `E2E_TARGET=test`). |

## What's covered

| Area | Tests |
|---|---|
| Shell / navigation | shell hydrates, each view deep-links, sidebar round-trip |
| Legal Intake | cockpit loads, all section tabs open crash-free, New Request picker, **@mutation** file an NDA ticket |
| Contracts | repository loads, KPI tiles + lifecycle pipeline, sub-tabs, search filter, row/detail, **@mutation** open New Contract modal |
| ONE Legal | front-door composer loads, example chips, Route enables on input, **@mutation** ask a question → answer card |

Every test captures a full-page screenshot into the report, so even a passing
run gives you a visual record of each feature.

## Adding tests

- Put specs under `e2e/tests/<area>.spec.ts`.
- Use the helpers in `e2e/support/app.ts` (`openView`, `assertNoCrash`, `shot`).
- The app has almost no `data-testid`s — select by exact visible text,
  `getByRole`, or the handful of `aria-label`s (documented inline in the specs).
- Tag any test that writes data `@mutation` and call `requireMutationsEnabled()`
  at the top of its body.

## Notes / limitations

- Chromium only (the demo is a desktop web app). Add projects in
  `playwright.config.ts` for other browsers if needed.
- ONE Legal answer quality depends on the app having `ANTHROPIC_API_KEY`; without
  it the server degrades to a deterministic classifier, so the `@mutation`
  ONE-Legal test asserts an answer card appears, not its wording.
- These tests confirm features **render and respond**. Judgement calls (is the
  AI answer good? does the demo flow feel right?) live in the manual checklist.
