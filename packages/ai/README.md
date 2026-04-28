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
| `CLAUDE_MODEL` | const | model id (currently `claude-sonnet-4-20250514`) |
| `CLAUDE_ENDPOINT` | const | `/api/claude` |
| `classifyIntakeRegex(text)` | client | offline regex fallback for intake triage |
| `handleClaudeRequest(req, res)` | **server** | mounted at `apps/web/pages/api/claude.ts` |

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
