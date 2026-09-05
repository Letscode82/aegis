# AEGIS scale worker — Railway runbook (Track A / A7)

> Goal: remove the serverless caps on large collections / archives /
> processing by moving the heavy work to a persistent **Railway worker** that
> drains a job queue. AEGIS on Vercel stays the control plane + UI; the worker
> does the long, memory-hungry runs.

## Why a worker

Vercel serverless functions bound the current pipeline:

| Limit | Effect today | Removed by |
|---|---|---|
| ~4.5 MB request body | small inline uploads only | **A2** — Blob upload (shipped) |
| Function timeout (~10–60s) | large archives / big collections can't finish in one request | **A1 + worker (this)** |
| Function memory | whole archive loaded + unzipped in RAM | **A3** chunked/streaming + worker |

A2 (Blob upload) + A5 (parallel extraction) + A6 (benchmark) are shipped and
already lift the common case. The **worker** is what makes AEGIS credibly
faster than Purview at *volume*.

## Architecture

```
Vercel (AEGIS app)                 Railway (same project as Tika)
 ─ enqueue ProcessingJob  ───────►  worker: claim job → process with
   (A1: ProcessingJob table)         bounded concurrency (mapLimit, A5)
 ─ poll job status for UI            → checkpoint progress to the job row
                                      → persistReviewSet items
                                      → Tika sidecar for extraction/OCR
```

- **Job queue** — `ProcessingJob` table + claim/complete service (A1,
  pg-boss-ready; runs via the worker loop or an HTTP trigger). Migration.
- **Chunked ingest** (A3) and **job-driven collection** (A4) are the job
  *kinds* the worker runs, checkpointing a cursor so a restart resumes.

## Deploy the worker on Railway

1. In the **same Railway project** as `aegis-tika`, **New → Deploy from
   GitHub repo** → select `Letscode82/aegis`.
2. **Start command:** the worker entrypoint (ships with A1/A3/A4), e.g.
   `pnpm --filter @aegis/db exec node ./scripts/run-worker.js` — a loop that
   claims and runs `ProcessingJob`s until idle, then sleeps.
3. **Environment variables** (Railway → service → Variables):
   - `DATABASE_URL` — the same Neon URL the app uses (the worker shares the DB).
   - `TIKA_SERVER_URL` — `http://<tika-service>:9998` (internal Railway URL is
     cheapest; private networking keeps Tika off the public internet).
   - `ANTHROPIC_API_KEY` — only if the worker runs AI review jobs.
   - `PROC_EXTRACT_CONCURRENCY` — extraction fan-out (default 4; raise on a
     bigger instance).
4. **Instance size:** ≥ 2 GB RAM (unzip + Tika OCR are memory-hungry);
   scale up for larger matters. Restart policy: **on failure** (jobs are
   idempotent + checkpointed, so a restart resumes).
5. **Scaling:** run 1 worker to start; the claim step serialises on the job
   row, so you can add replicas later for parallel matters without double-work.

## Security / data residency

- Keep Tika and the worker on Railway **private networking**; only the Vercel
  app needs the public Tika URL (or route the app through the worker too).
- The worker reads the same Neon DB — no new secret store. KMS envelope
  encryption of stored M365 secrets (HARD-1) still applies before a paying
  client.

## Status

Shipped: A2 (Blob upload), A5 (parallel extraction), A6 (benchmark).
Pending (migration — apply on Neon, then merge): **A1** job model, **A3**
chunked ingest, **A4** job-driven collection. Once A1 is applied, the worker
entrypoint referenced above lands with A3/A4 and this runbook goes live.
