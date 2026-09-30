# AEGIS Laya Service

A small, self-hosted **System-1 typed-decision** engine that powers intake
triage in `@aegis/ai` (`classifyIntakeLaya`). Running it in your own tenant
means confidential inbound legal text is classified in-house and never sent to
a third-party classification API.

[Laya](https://github.com/NandhaKishorM/laya) (Apache-2.0) is schema-identical
to the paid JEV System-1 service (`POST /v1/systemone`), so `classifyIntakeLaya`
is a drop-in for either. Laya picks the intake category **semantically**; Claude
(System 2) still does the reasoning/drafting downstream. When Laya is unset,
down, or low-confidence, intake **degrades to the regex classifier** — nothing
breaks.

Default weights auto-download from Hugging Face (`convaiinnovations/laya`) on
first boot. CPU-only; no GPU.

> This service is intentionally **outside** the pnpm/turbo workspace
> (`apps/*`, `packages/*`, `modules/*`), so it is inert to the JS build/CI.

## HTTP contract

What `@aegis/ai/src/laya.js` sends and expects:

```
POST /v1/systemone
{
  "state": { "body": "[Department: Sales] We need an NDA with Acme…" },
  "questions": {
    "category": { "type": "choice", "instructions": "…", "criteria": [ … ] }
  }
}
->
{ "answers": { "category": { "choice": "<category>", "confidence": 0.0-1.0 } } }
```

If `LAYA_API_KEY` is set, `/v1/systemone` requires `Authorization: Bearer <key>`.

## Deploy to Railway (~10 min)

1. **New Project → Deploy from GitHub repo** → pick `Letscode82/aegis`.
2. **Settings → Root Directory** = `services/laya` (Railway builds the Dockerfile here).
3. **Variables**: add `LAYA_API_KEY` = a long random string.
   (Optional: `LAYA_MODELS`, `LAYA_THREADS` — see below.)
4. **Settings → Networking → Generate Domain** → copy the `https://…up.railway.app` URL.
5. First boot downloads the model (a few minutes with `LAYA_PRELOAD=1`); watch
   the deploy logs until it's serving.
6. **Smoke test**:
   ```bash
   curl -s -X POST https://<domain>/v1/systemone \
     -H "Authorization: Bearer <key>" -H "Content-Type: application/json" \
     -d '{"state":{"body":"We need a mutual NDA with a vendor before sharing specs"},
          "questions":{"category":{"type":"choice",
            "instructions":"Classify this inbound legal request.",
            "criteria":["NDA","Vendor Contract","Litigation","General Inquiry"]}}}' \
     | head -c 300
   ```

## Wire AEGIS to it

Set on the **Vercel (aegis web)** project:

| Env | Value |
|---|---|
| `LAYA_URL` | `https://<domain>` (no `/v1/systemone` — the client appends it) |
| `LAYA_API_KEY` | the same key |

Redeploy the web app. Intake (`/api/intake/request`, `/api/intake/request-stream`)
then calls Laya first and falls back to regex automatically. `isLayaConfigured()`
reports `true` once `LAYA_URL` is set.

## Run locally

```bash
cd services/laya
docker build -t aegis-laya .
docker run -p 8000:8000 -e LAYA_API_KEY=dev aegis-laya
# (first boot downloads the model)
curl -s -X POST localhost:8000/v1/systemone \
  -H "Authorization: Bearer dev" -H "Content-Type: application/json" \
  -d '{"state":{"body":"NDA please"},"questions":{"category":{"type":"choice","instructions":"Classify.","criteria":["NDA","General Inquiry"]}}}'
```

## Tuning env vars

`laya-serve` reads these (the Dockerfile sets sensible defaults):

| Env | Default | Notes |
|---|---|---|
| `LAYA_HOST` | `0.0.0.0` | Must stay `0.0.0.0` in a container. |
| `LAYA_PORT` | `$PORT` or `8000` | Railway injects `$PORT`. |
| `LAYA_DEVICE` | `cpu` | `cpu` for the $5 Railway plan; `cuda` if a GPU is available. |
| `LAYA_PRELOAD` | `1` | Load weights at boot so the first request is warm. |
| `LAYA_MODELS` | `english` | Which model set to load. |
| `LAYA_THREADS` | (laya default) | Raise to use more CPU cores. |
| `LAYA_API_KEY` | (unset) | Bearer token; must match `LAYA_API_KEY` on the web app. |

## Cost / sizing note

Laya is heavier than the embeddings service. If the $5 Railway instance is
memory-constrained on boot, either bump the instance size or leave `LAYA_URL`
unset — intake keeps working on the regex classifier until Laya is available.
