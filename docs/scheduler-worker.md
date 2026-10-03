# AEGIS scheduler worker (`apps/worker`) — F-6

A long-running Node process that hosts the platform's recurring jobs on
[pg-boss](https://github.com/timgit/pg-boss). pg-boss stores its queues and
cron schedules in Postgres (its own `pgboss` schema, created automatically on
first start) — the same database the app uses, so there's no extra
infrastructure or secret store.

This replaces the requirement for an external scheduler (Vercel Cron, GitHub
Actions, a manual admin button) to drive the jobs. Those HTTP trigger routes
(`/api/cron/*`, `/api/admin/jobs/*`) **stay in place** as a manual / fallback
path, so a deployment without the worker still works — the worker is purely
additive.

## Jobs

| Queue | Cadence (UTC) | Pass |
|---|---|---|
| `contract-sweeps` | daily 07:00 | `runAllOrgContractSweeps` — arm renewal notices, flip overdue obligations to BREACHED |
| `contract-digest` | Mon 08:00 | `runAllOrgContractDigests` — weekly leadership digest email |
| `dsar-sla-sweep` | daily 06:00 | `runAllOrgDsarSlaSweeps` — flag DSARs past their statutory deadline |
| `defensibility-snapshot` | daily 06:30 | `runDailySnapshotPass` per org — daily legal-hold defensibility snapshot |
| `defensibility-cleanup` | Mon 09:00 | `runWeeklyCleanupPass` per org — thin snapshots older than 90 days |
| `intake-sla-scan` | hourly | `evaluateSlaBreaches` per org — escalate tickets past SLA |

Every pass is idempotent, so a missed or doubled run is safe. Per-org failures
inside a pass are isolated — one org throwing never aborts the batch.

## Run it

```bash
DATABASE_URL=postgres://… pnpm --filter @aegis/worker start
```

Local development (restarts on change):

```bash
DATABASE_URL=postgres://… pnpm --filter @aegis/worker dev
```

### Environment

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | the same Postgres/Neon URL the app uses |
| `PGBOSS_SCHEMA` | no | pg-boss schema name (default `pgboss`) |
| `ANTHROPIC_API_KEY` | no | only if a scheduled pass runs AI |
| `CONTRACT_DIGEST_TO` | no | extra digest recipients (same var the HTTP path reads) |

## Deploy

Deploy as a single always-on service (Railway, Fly.io, a container, a systemd
unit) with `DATABASE_URL` set and the start command above. One replica is
enough: pg-boss serialises each scheduled fetch on the job row, so a single
worker drains all queues. Set the restart policy to **on-failure** — jobs are
idempotent, so a restart is safe.

The first `start()` creates the `pgboss` schema and its tables in the
database. No Prisma migration is involved; pg-boss manages its own schema.

### Scaling

Add replicas for throughput once job volume grows — the claim step serialises
on the job row, so replicas won't double-run a scheduled job. This is separate
from the heavy collection/processing worker described in
[`scale-worker-runbook.md`](./scale-worker-runbook.md), which drains the
`ProcessingJob` queue; the two can run as separate services or be merged later.
