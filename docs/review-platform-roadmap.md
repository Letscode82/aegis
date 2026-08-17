# Review Platform roadmap — one AI-review engine, many workflows

The collect → cull → AI-triage → human-review → produce spine (built for DSAR
+ legal hold) is a general engine. This plan hardens the **shared AI review**
first — because the same engine serves both **culling** (reduce volume cheaply)
and **production** (defensible privilege/issue coding) — then plugs each
workflow into it.

**Design invariants (unchanged):** AI proposes, humans dispose; every AI call
degrades to a deterministic fallback; per-item provenance (prompt + model
version) on the chain-sealed audit; module isolation via `api.ts`.

Legend — Migration: 🟥 yes (apply to Neon before merge) · ⬜ none.
Reuse = existing primitives leveraged.

---

## Phase 0 — Strengthen the shared AI review engine  ⭐ (foundation)

Today's AI review (DSAR `review.ts`) is single-dimension ("relevant y/n") and
lives inside `@aegis/privacy`. Culling and production need more: multiple tag
dimensions, citations, confidence-based routing, configurable + versioned
instructions, and a pilot→validate→scale loop. Extract it into a shared engine.

| PR | Scope | Reuses | New | Mig |
|---|---|---|---|---|
| **AIR-1** | New `@aegis/ai-review` package (pure): multi-dimension tag schema (`responsive` per-issue, `privileged`, `confidential/PII`, `key-doc`, `redact-candidate`), each with **confidence + citation (supporting passage)**; prompt builder; strict-JSON parser; deterministic fallback scorer per dimension. No DB. Unit-tested. | `@aegis/ai`, relevance.ts | tag schema, citation type, per-dimension scorer | ⬜ |
| **AIR-2** | **Review instructions + versioning**: `ReviewProfile` (issues, prompt template, model params, thresholds) with immutable `ReviewProfileVersion`. The concept's "develop instructions" surface + "✨ Draft with AI" to draft criteria. | AgentDefinition-versioning pattern | schema + editor | 🟥 |
| **AIR-3** | **Run on ReviewSetItems** (eDiscovery/culling): `runAiReviewOnReviewSet` scores items multi-dimensionally with citations; records prompt+model version per item; **routes** low-confidence / privileged → attorney queue, high-confidence non-priv → reviewer queue. Console shows citation + confidence + route. | review-set, reviewer console, withGraphAudit | scoring service, routing, schema cols | 🟥 |
| **AIR-4** | **Pilot → validate → scale loop**: run on a stratified sample, compute recall/precision/overturn, refine + re-version the profile, then **apply-at-scale**. "Uncited high-confidence → fail closed to human." | `@aegis/validation`, stratifiedSample | pilot orchestration | ⬜ |
| **AIR-5** | **Migrate DSAR review onto the shared engine** — replace privacy's bespoke scorer with `@aegis/ai-review`; keep behavior + add citations/confidence to DSAR cards. | privacy review.ts | swap + UI | ⬜ |
| **AIR-6** | **Batch runner + progress** for large sets (chunked, resumable) + a cross-module **AI Validation** read (recall/precision/overturn/drift) surfaced per profile. | cron pattern, validation | batch, dashboard | ⬜ |

*Everything below depends on Phase 0.*

---

## Phase 1 — Culling / Early Case Assessment (ECA)

"How big is this and what's it about, before we pay to review it."

| PR | Scope | Reuses | New | Mig |
|---|---|---|---|---|
| **ECA-1** | Dedup + email **threading** + inclusive-email detection on a review set (flags on `ReviewSetItem`). | review-set | dedupe/threading | 🟥 |
| **ECA-2** | **AI theme clustering** (embeddings) + junk-domain quarantine via AIR responsive/junk dimension. | ai-review (AIR) | clustering | ⬜ |
| **ECA-3** | **ECA dashboard**: volume funnel (collected → deduped → threaded → in-scope), cost estimate, freeze scope. | dashboard patterns | funnel UI | ⬜ |

---

## Phase 2 — Internal Investigations module

The flagship second demo — exercises the whole spine end-to-end.

| PR | Scope | Reuses | New | Mig |
|---|---|---|---|---|
| **INV-1** | Investigations surface (a Matter type): source letter → **AI issue extraction** → draft plan + custodian suggestions. | matter, ai-review, intake | investigation shell | 🟥 |
| **INV-2** | Wire **hold + custodian-scoped collection** from the investigation. | legal hold, hold↔collection bridge | glue | ⬜ |
| **INV-3** | **Issue-coding review** (AIR multi-dimension) + reviewer console + **chronology builder** (facts assemble as docs are coded). | review-set console | chronology | 🟥 |
| **INV-4** | **Findings report** + production + a real-tenant **investigation seeder** (like Priya's). | production, seeder pattern | report, seeder | ⬜ |

---

## Phase 3 — FOIA / Subpoena / Regulator response

Thin wrappers on the DSAR + review-set spines.

| PR | Scope | Reuses | New | Mig |
|---|---|---|---|---|
| **FOIA-1** | Public-records request = DSAR spine with **exemption review** (AIR "exempt/responsive" dimension) instead of relevance. | DSAR spine, ai-review | request wrapper | 🟥 |
| **SUBP-1** | Subpoena / regulator response = review-set + **production cover sheet** + Bates. | review-set, production | request wrapper | 🟥 |

---

## Phase 4 — Legal Hold notifications (live)

Close the productiony stubs now that `@aegis/email` + cron exist.

| PR | Scope | Reuses | New | Mig |
|---|---|---|---|---|
| **HOLD-N1** | Real hold-notice **delivery** via `@aegis/email` + acknowledgment tracking. | email, hold notices | wire delivery | ⬜ |
| **HOLD-N2** | **Re-attestation reminders + escalation** cron across orgs. | cron worker | sweep | ⬜ |

---

## Phase 5 — Privacy build-out (module #10)

| PR | Scope | Reuses | New | Mig |
|---|---|---|---|---|
| **PRIV-2** | Breach/incident **72-hour** response: intake → GDPR Art. 33 clock → affected-record scoping → notification workflow. | SLA/cron, email, collection | incident workflow | 🟥 |
| **PRIV-3** | **ROPA** management (Article 30 register). | DataProcessingActivity | CRUD + UI | ⬜/🟥 |
| **PRIV-4** | **Consent** lifecycle. | ConsentRecord | UI + service | ⬜ |
| **PRIV-5** | **DPIA** approval workflow. | approval patterns | schema + flow | 🟥 |

---

## Phase 6 — Platform capabilities (one build, every module benefits)

| PR | Scope | Reuses | New | Mig |
|---|---|---|---|---|
| **PLAT-1** | **Notifications & Deadlines Hub** — unify DSAR SLAs, hold re-attestations, contract renewals, regulatory deadlines. | events, email, cron | aggregator + UI | ⬜/🟥 |
| **PLAT-2** | **AI Validation dashboards** across every AI workflow (intake agents, contract assessment, review). | `@aegis/validation`, AIR | dashboards | ⬜ |
| **PLAT-3** | **Copilot / Agent 365 auditing** — agents as custodians; AccessedResources gap checks. | M365 integration, hold | Graph audit reads | ⬜/🟥 |

---

## Execution order & dependencies

1. **Phase 0** first (AIR-1 → AIR-6) — the engine everything reuses.
2. Then **Phase 1 (ECA)** and **Phase 2 (Investigations)** in parallel-ish — both consume AIR.
3. **Phase 3/4** are quick wins that can slot anytime after AIR-1 (FOIA) / independently (HOLD-N).
4. **Phase 5/6** as capacity allows.

Migration PRs (🟥) are pushed + held for you to `prisma migrate deploy` on Neon
before merge, same cadence as the DSAR + review-set work.
