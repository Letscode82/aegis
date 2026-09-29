# AEGIS Embeddings Service

A small, self-hosted CPU sentence-embedding endpoint that powers `@aegis/search`'s
**semantic** retrieval (K1). Running it in your own tenant means privileged legal
text is embedded in-house and never sent to a third-party embedding API.

Default model: **`BAAI/bge-small-en-v1.5`** (384-dim) — tiny, fast on CPU, no GPU.

> This service is intentionally **outside** the pnpm/turbo workspace
> (`apps/*`, `packages/*`, `modules/*`), so it is inert to the JS build/CI.

## HTTP contract

Matches the `EMBEDDINGS_URL` provider in `@aegis/search`:

```
POST /embed   {"input": ["text", ...]}   ->  {"embeddings": [[...]], "model": "<name>", "dim": N}
GET  /health                             ->  {"ok": true, "model": "<name>", "dim": N}
```

If `EMBEDDINGS_API_KEY` is set, `/embed` requires `Authorization: Bearer <key>`.

## Deploy to Railway (~10 min)

1. **New Project → Deploy from GitHub repo** → pick `Letscode82/aegis`.
2. **Settings → Root Directory** = `services/embeddings` (Railway builds the Dockerfile here).
3. **Variables**: add `EMBEDDINGS_API_KEY` = a long random string. (Optional `MODEL_NAME` to change the model.)
4. **Settings → Networking → Generate Domain** → copy the `https://…up.railway.app` URL.
5. **Smoke test**:
   ```bash
   curl -s https://<domain>/health
   curl -s -X POST https://<domain>/embed \
     -H "Authorization: Bearer <key>" -H "Content-Type: application/json" \
     -d '{"input":["limitation of liability cap"]}' | head -c 200
   ```

## Wire AEGIS to it

Set on the **Vercel (aegis web)** project — and locally when running the backfill:

| Env | Value |
|---|---|
| `EMBEDDINGS_URL` | `https://<domain>` (no `/embed` — the client appends it) |
| `EMBEDDINGS_API_KEY` | the same key |
| `EMBEDDINGS_MODEL` | `bge-small-en-v1.5` (stable retrieval partition key) |

Then, once (Neon has pgvector):

```bash
pnpm --filter @aegis/db run db:migrate:deploy          # creates the vector column
EMBEDDINGS_URL=https://<domain> EMBEDDINGS_API_KEY=<key> \
EMBEDDINGS_MODEL=bge-small-en-v1.5 DATABASE_URL=<neon-url> \
pnpm --filter @aegis/search run backfill                # embed existing documents
```

After that, uploads auto-embed and ONE Legal's cited Q&A runs true semantic
retrieval. Until then everything still works via the keyword fallback.

## Run locally

```bash
cd services/embeddings
docker build -t aegis-embeddings .
docker run -p 8000:8000 -e EMBEDDINGS_API_KEY=dev aegis-embeddings
curl -s localhost:8000/health
```

## Switching models

Change `MODEL_NAME` (build arg or env). The vector dimension changes with the
model, and `@aegis/search` partitions retrieval by `embeddingModel`, so **re-run
the backfill** after a model change — old vectors stay isolated but become
unreachable by the new query model until re-indexed.
