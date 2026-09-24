# @aegis/ai

Claude API client + serverless proxy. The single point of contact between
AEGIS code and the Anthropic API.

## Public surface

```js
import { callClaude, callClaudeJSON, friendlyAIError, CLAUDE_MODEL, classifyIntakeRegex } from "@aegis/ai";
import { handleClaudeRequest } from "@aegis/ai/proxy"; // server-only
```

| Export | Side | Purpose |
|---|---|---|
| `callClaude(prompt, opts)` | client | POST to `/api/claude`, return text |
| `callClaudeJSON(prompt, opts)` | client | POST + tolerant JSON parse |
| `parseJSONLoose(text)` | client | strip code fences, salvage JSON |
| `friendlyAIError(err)` | client | user-facing error message |
| `CLAUDE_MODEL` | const | model id (currently `claude-sonnet-4-6`) |
| `CLAUDE_ENDPOINT` | const | `/api/claude` |
| `classifyIntakeRegex(text)` | client | offline regex fallback for intake triage |
| `classifyIntakeLaya(text, dept, opts?)` | **server** | Laya System-1 typed-decision triage; `null` when disabled/unavailable |
| `isLayaConfigured()` | **server** | true when `LAYA_URL` is set |
| `handleClaudeRequest(req, res)` | **server** | mounted at `apps/web/pages/api/claude.ts` |

## Laya — System-1 typed-decision triage

[Laya](https://github.com/NandhaKishorM/laya) (Apache-2.0) is a
non-autoregressive decision engine: typed `choice` / `score` / `noul`
decisions over text in one forward pass (~33 ms), 100+ languages,
self-hosted. Its HTTP API (`POST /v1/systemone`) is schema-identical to the
paid JEV service, so `classifyIntakeLaya` is a drop-in for either — we run
the open-source Laya so confidential legal text never leaves the tenant.

It sits between the regex classifier (deterministic floor) and Claude
(System 2). For intake triage, Laya picks the category semantically; the
category maps to the **same** team / SLA / priority the regex classifier
uses, so downstream behaviour is unchanged. The intake front-door routes
(`/api/intake/request`, `/api/intake/request-stream`) call Laya first and
fall back to regex, then a default — so an unset endpoint or a down service
changes nothing. Rollout is intake-first; other surfaces (eDiscovery
relevance, DSAR review, clause risk) adopt it once results are good.

**Config (server-side only):**
- `LAYA_URL` — base URL of the Laya server (e.g. `http://laya:8000`). Unset → disabled.
- `LAYA_API_KEY` — optional bearer token (matches the server's `LAYA_API_KEY`).

## Why a single package
- The API key never leaves the server; the client never sees it.
- One place to bump the model version (`CLAUDE_MODEL`).
- One place to enforce rate limits and request-size caps.
- The regex fallback lets the demo work with no API key configured.

## Future scope (not implemented)
- Prompt-cache helpers
- Streaming responses
- Tool use / function calling
- Per-feature usage metering (writes to `AuditLog`)

These are tracked as needs of specific modules; they will be added when a
caller needs them.
