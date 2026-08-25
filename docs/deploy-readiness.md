# AEGIS eDiscovery — deploy readiness

What's real vs. mocked across the eDiscovery / investigation / review lifecycle,
and the component or API that enables each. Kept current as gaps close.

Legend: ✅ real · ⚠️ partial / stub · ☐ pending · (loop updates rows to ✅).

## What's real vs. mocked — and what powers it

| Capability | Status | Enabled by (component / API) | Notes & caveats |
|---|---|---|---|
| Mailbox / OneDrive / Teams collection | ✅ Real | **Microsoft Graph** per-user endpoints (`/users/{id}/messages`, `/drive`, `/chats`) via `M365GraphClient` (app-only) → `searchForDataSubject`; full body + attachment `contentBytes` | Needs app-only Graph perms (`Mail.Read`, `Files.Read.All`, `Sites.Read.All`). REAL GRAPH verified. |
| Text processing / extraction | ✅ Real (OCR pending) | `text-extract.ts` — HTML→text + text/csv/json/xml/rtf + **PDF (pdf-parse)** + **DOCX (mammoth)** | Image **OCR** for scanned pages still needs a cloud OCR service (Azure Document Intelligence) — documented follow-up. |
| Tenant-scale collection estimate | ✅ Real | **Purview eDiscovery** `estimateStatistics` (`microsoft.graph.security`) → `estimatePurviewCollection` (CW-2) | Tenant-wide size without per-user pull. |
| Legal holds (lifecycle + defensibility) | ✅ Real | `@aegis/matter` legal-hold services; event-sourced `LegalHoldEvent` + chain-sealed `AuditLog` | Deterministic defensibility scorecard. |
| Purview eDiscovery preservation | ✅ Real | **Microsoft Graph Security eDiscovery** (`/security/cases/*`) via `M365GraphDelegatedClient` (**Device Code OAuth**, delegated) | Degrades to vault-copy without **E5 / eDiscovery Premium**. |
| Culling (dedup, threading, keyword/junk, source-type, date-window) | ✅ Real | `@aegis/review` `threading.ts` + `cull.ts` (deterministic) | Reversible, chain-sealed exclusion log. |
| LLM per-document review | ✅ Real | `@aegis/ai-review` (prompt + strict-JSON parse) + `@aegis/ai` → **Anthropic Claude API** via `/api/claude` proxy | LLM-first batched reviewer; deterministic fallback. **"Review all →" loops in 400-doc chunks over unscored items** to review a set of any size. |
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

1. ✅ **PDF / DOCX text extraction** (PR #361). PDF (pdf-parse) + DOCX (mammoth),
   degrade-safe, server-external in next.config. Image OCR deferred (needs a
   cloud OCR service) — moved to Hardening-adjacent follow-ups.
2. ✅ **Resumable batch review runner** (PR pending). `unscoredOnly` mode scores
   the next chunk of `aiRoute IS NULL` items per call and reports `remaining`; a
   "Review all →" button loops until the whole set is scored. Migration-free.

## Hardening — deferred to first paying client (not now)

- KMS envelope encryption for M365 secrets (replaces dev AES key).
- Real hold-notice email send (SMTP / SES / Graph `sendMail`).
- Live RelativityOne push (real Import API call behind `RELATIVITY_API_TOKEN`).

## Log
- (start) Readiness doc created; LLM per-doc review landed (PR #360). Beginning the two pending items.
- item 1 ✅ merged PR #361 — PDF (pdf-parse) + DOCX (mammoth) extraction, degrade-safe, build-verified. OCR (scanned images) deferred to a cloud OCR follow-up.
- item 2 ✅ — resumable batch review runner (unscoredOnly + remaining + "Review all →" loop). Both non-hardening items done; only OCR (cloud) + the deferred hardening remain.
