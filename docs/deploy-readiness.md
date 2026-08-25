# AEGIS eDiscovery — deploy readiness

What's real vs. mocked across the eDiscovery / investigation / review lifecycle,
and the component or API that enables each. Kept current as gaps close.

Legend: ✅ real · ⚠️ partial / stub · ☐ pending · (loop updates rows to ✅).

## What's real vs. mocked — and what powers it

| Capability | Status | Enabled by (component / API) | Notes & caveats |
|---|---|---|---|
| Mailbox / OneDrive / Teams collection | ✅ Real | **Microsoft Graph** per-user endpoints (`/users/{id}/messages`, `/drive`, `/chats`) via `M365GraphClient` (app-only) → `searchForDataSubject`; full body + attachment `contentBytes` | Needs app-only Graph perms (`Mail.Read`, `Files.Read.All`, `Sites.Read.All`). REAL GRAPH verified. |
| Text processing / extraction | ⚠️ Partial | `@aegis/review` `text-extract.ts` (HTML→text + text/csv/json/xml/rtf attachments) | **PDF / DOCX / OCR** in progress — see Pending. |
| Tenant-scale collection estimate | ✅ Real | **Purview eDiscovery** `estimateStatistics` (`microsoft.graph.security`) → `estimatePurviewCollection` (CW-2) | Tenant-wide size without per-user pull. |
| Legal holds (lifecycle + defensibility) | ✅ Real | `@aegis/matter` legal-hold services; event-sourced `LegalHoldEvent` + chain-sealed `AuditLog` | Deterministic defensibility scorecard. |
| Purview eDiscovery preservation | ✅ Real | **Microsoft Graph Security eDiscovery** (`/security/cases/*`) via `M365GraphDelegatedClient` (**Device Code OAuth**, delegated) | Degrades to vault-copy without **E5 / eDiscovery Premium**. |
| Culling (dedup, threading, keyword/junk, source-type, date-window) | ✅ Real | `@aegis/review` `threading.ts` + `cull.ts` (deterministic) | Reversible, chain-sealed exclusion log. |
| LLM per-document review | ✅ Real | `@aegis/ai-review` (prompt + strict-JSON parse) + `@aegis/ai` → **Anthropic Claude API** via `/api/claude` proxy | LLM-first batched reviewer; deterministic fallback. Bounded to 400 docs/run — see Pending (batch runner). |
| Copilot (Ask) / Case Graph theory / theme names | ✅ Real | `@aegis/review` `copilot.ts`, `case-graph.ts`, `clusters.ts` + **Claude API** | Grounded, cited; deterministic fallback. |
| Case AutoPilot (orchestration) | ✅ Real | `@aegis/review` `autopilot.ts` — planner + loop over the tools | Governed: `AgentDecision` gate per mutating step. |
| AI governance (human gate + audit) | ✅ Real | `AgentDecision` table + **D11 chain-sealed `AuditLog`** (Postgres triggers, SHA-256 chain) | Tamper-evident; `verifyAuditChain`. |
| ECA dashboard / theme clustering | ✅ Real | `@aegis/review` `eca.ts` + `clustering.ts` (TF-IDF) + optional Claude labels | On-the-fly, no storage. |
| Validation (recall/precision/F1/overturn) | ✅ Real | `@aegis/validation` (Wilson CIs, stratified sample) | Org-wide dashboard `/review/validation`. |
| Produce (Bates + privilege log) | ✅ Real | `@aegis/review` `coding.ts` | Every item coded first; chain-sealed. |
| Concordance `.dat` / Opticon `.opt` export | ✅ Real | `@aegis/review` `export.ts` (ASCII-20/254) | Industry-standard load files. |
| RelativityOne "Push to workspace" | ⚠️ Stub-first | `/relativity-push` → **RelativityOne Import API** payload (real call behind `RELATIVITY_API_TOKEN`) | Hardening — deferred. |
| Hold-notice email delivery | ⚠️ Stub | notice composer writes issuance + chain rows; no SMTP/SES/Graph `sendMail` | Hardening — deferred. |
| Auth / RBAC | ✅ Real | **Auth0** + `@aegis/auth` (40 permissions, 8 roles, `canUserDo`) | Dev-mode fallback for local. |
| Database | ✅ Real | **Postgres (Neon)** via **Prisma** | Pooled URL for app; `migrate deploy`. |
| M365 secret storage | ⚠️ Dev-crypto | `crypto.ts` **AES-256-GCM** with `AEGIS_ENCRYPTION_KEY` | Hardening: KMS envelope encryption before first customer. |

## Pending work (non-hardening) — burning down on loop

1. ☐ **PDF / DOCX / OCR text extraction.** Extend `text-extract.ts` so collected
   PDF and Word attachments (and, where feasible, scanned images) become
   searchable, reviewable text — not just filenames. Adds server-side parsers
   (no schema).
2. ☐ **Resumable batch review runner (AIR-6).** Review a whole collection past
   the 400-doc/run cap: score the next chunk of *unscored* items per call
   (`aiRoute IS NULL` as the progress marker), a "Review all" UI that loops with
   a progress bar until none remain. Migration-free.

## Hardening — deferred to first paying client (not now)

- KMS envelope encryption for M365 secrets (replaces dev AES key).
- Real hold-notice email send (SMTP / SES / Graph `sendMail`).
- Live RelativityOne push (real Import API call behind `RELATIVITY_API_TOKEN`).

## Log
- (start) Readiness doc created; LLM per-doc review landed (PR #360). Beginning the two pending items.
