# AEGIS — Intake-only client install

This guide deploys AEGIS for a client who licenses **Legal Intake only**.

## What "Intake-only" means here

AEGIS is one application (`apps/web`, a Next.js app) over one Postgres
database. You do **not** ship a carved-out "intake module" — you deploy
the whole app with the **intake navigation profile** so the client sees
only Intake. The rest of the platform keeps running underneath, which is
what gives Intake its full capability:

- All 6 agents (NDA, Vendor/OFAC, Trademark, Contract Review, FAQ, Policy)
- Document upload (`.docx` / `.txt` / `.pdf`) feeding the agents
- Email channel: inbound webhook **and** real Microsoft 365 mailbox polling
- **Server-side triage** — emailed/polled tickets are triaged on arrival
- Smart routing, SLA dashboard, Self-Service KB
- Ticket → **Matter auto-spawn** on approval (the "one brain" payoff)
- Chain-sealed `AuditLog` evidence

The client just doesn't see the other module tabs.

## 1. Turn on the profile

```bash
NEXT_PUBLIC_AEGIS_PROFILE=intake
```

The side-nav then shows **Legal Intake** + **Users / Roles / Audit Log**
(each still permission-gated). Every other module is hidden, and stale
`?view=` deep links to hidden modules fall back to Intake.

## 2. Environment

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres (Neon or self-hosted). |
| `ANTHROPIC_API_KEY` | ✅ for real agents | Without it, agents fall back to the deterministic classifier. |
| `AUTH0_SECRET`, `AUTH0_BASE_URL`, `AUTH0_ISSUER_BASE_URL`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` | ✅ for prod | Real login + RBAC. Without them, dev-mode resolves everyone to the seeded admin — **never deploy to a client without these.** |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME` | ✅ for prod | The real admin's Auth0 email + display name (see CLAUDE.md). |
| `AEGIS_EMAIL_WEBHOOK_SECRET` | ✅ for the email webhook | Constant-time auth; the webhook is **fail-closed in production** (503 if unset). |
| `NEXT_PUBLIC_AEGIS_PROFILE=intake` | ✅ | Intake-only nav. |
| M365 delegated service account | only for P4b mailbox polling | See `docs/m365-ediscovery-onboarding.md`. |

## 3. Install, migrate, seed, run

```bash
pnpm install
pnpm --filter @aegis/db exec prisma migrate deploy   # applies all migrations
pnpm --filter @aegis/db run seed                      # or the client's own seed
pnpm build
pnpm --filter @aegis/web start                        # or deploy apps/web to Vercel
```

For Vercel: set all the env vars above on the project, point it at
`apps/web`, and connect the Neon database.

## 4. Email channel (optional, gives Intake its full reach)

- **Webhook (no M365 needed):** `POST /api/intake/email-webhook` with the
  secret header. Demoable with `curl`.
- **Real M365 polling (P4b):** connect the delegated service account at
  `/admin/m365` (re-authorize so it picks up `Mail.Read` + `Mail.Send`),
  add a mailbox via `POST /api/admin/intake/mailboxes`, and schedule
  `POST /api/admin/intake/mailboxes/poll` (Vercel Cron / GitHub Actions).
  Set `autoAckEnabled` on the mailbox for threaded auto-replies.

## 5. Before storing real client data (production gate)

Two hardening items remain (CLAUDE.md "before first paying customer"):

- **Secrets** — M365 tokens currently use dev-only plaintext encryption;
  swap in KMS/envelope encryption.
- **Tenancy isolation** — enforce one org per deployment / row-scoping.

The webhook fail-closed auth, idempotent ingest, and server-side triage
hardening are already in place.

## Why not extract Intake into its own repo?

Because it would **remove** capability: M365 email polling and
ticket→matter auto-spawn both reuse the shared `@aegis/matter` Graph +
matter services, and the agents/audit chain live in shared packages. A
standalone fork drops those features and permanently diverges from
`main`. The profile flag gives the client a clean Intake-only experience
with none of that loss.
