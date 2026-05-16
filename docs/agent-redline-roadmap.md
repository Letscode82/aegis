# Agent Redline Workflow — Multi-PR Roadmap

> **This document is derived from
> [`agent-redline-architecture.md`](./agent-redline-architecture.md).**
> The architecture doc is the durable source of truth for the
> non-negotiable commitments. This roadmap sequences PRs against
> those commitments using the **demo-grade-first, harden-
> incrementally** philosophy that the operator locked on
> 2026-05-16.
>
> If the roadmap and the architecture disagree, **the
> architecture wins** and the roadmap is wrong.
>
> **Status:** DRAFT pending operator merge of the architecture PR.

## Locked context

From `agent-redline-architecture.md` Decisions-locked log:

- **Target ICP:** Mid-market GC (Series B-D, 100-1000 employees,
  SOC2 + GDPR-if-EU)
- **Volume:** 100 reviews/day year-1, 1,000/day year-3
- **Build philosophy:** Demo-grade first, harden incrementally
- **First demo target:** ~3 weeks from operator green-light
- **First-paying-customer-ready target:** ~14 weeks

This means the roadmap is **two interleaved tracks**:

- **Feature track** — adds an agent or capability (12 PRs total)
- **Hardening track** — moves the system toward production
  SLOs along one of the 10 dimensions (6 PRs total)

Both tracks ship to the same `main` branch. Hardening PRs are
**not** held until features are complete — they're inserted
into the sequence at the point where their risk becomes the
binding constraint.

## Visual sequence

```
Week  PR      Track    Title                                       Demo win
────────────────────────────────────────────────────────────────────────────
  1   PR-A    F        Documents foundation skeleton +              Cockpit
                       Cockpit filter fix                            picks up
                                                                    new tickets
  2   PR-B    F        Playbook schema + admin editor + NDA seed   Admin UI
  3   PR-C    F        NDA agent v1 — paste-text → redlines       FIRST
                                                                    HERO DEMO
  4   PR-D    F        NDA agent v2 — file upload + .docx output  Real NDA
                                                                    workflow
  5   PR-Hard1 H       Multi-tenancy hardening (RLS + CI test)    (silent —
                                                                    security)
  6   PR-E    F        Contract Review agent (MSA / SOW)          Highest-ROI
                                                                    demo
  7   PR-Hard2 H       PII redaction layer + content                (silent —
                       classification                                privilege
                                                                    protection)
  8   PR-F    F        Privacy / DSAR agent                       Regulatory
                                                                    value demo
  9   PR-G    F        Vendor Due Diligence agent                 Procurement
                                                                    use case
 10   PR-Hard3 H       Reliability (circuit breakers + Claude       (silent —
                       fallback chain)                              uptime)
 11   PR-H    F        Trademark Check agent                       Brand-team
                                                                    use case
 12   PR-I    F        IP + Contract Q + Legal General             Q&A agents
                       (Q&A agents, shared base)
 13   PR-Hard4 H       Observability (Sentry + structured logs +    (silent —
                       basic metrics)                               on-call
                                                                    readiness)
 14   PR-J    F        Other (routing-only, no agent)              Last 1 of
                                                                    9 agents
 15   PR-Hard5 H       Rate limiting + cost control (per-org        (silent —
                       budgets + pre-flight estimation)             billing
                                                                    safety)
 16   PR-Hard6 H       Failover (S3 secondary + dual-write +        (silent —
                       hash verification)                           DR)
 17   PR-K    F        GDPR right-to-erasure + retention policy   First paying
                       + eDiscovery export                          customer-
                                                                    ready
────────────────────────────────────────────────────────────────────────────
                                                              Total: ~14-17 weeks
```

## Feature track (12 PRs)

### PR-A — Documents foundation skeleton + Cockpit filter fix

**Demo win:** Cockpit picks up newly-filed tickets (closes the
post-P1b gap where stage="assigned" tickets fell between the
"new" and "triaged" buckets).

**Ships:**
- `@aegis/documents` package becomes real:
  - `StorageBackend` interface (`upload`, `retrieve`, `delete`)
  - `VercelBlobStorageBackend` (default, production-ready) —
    written so dual-write (PR-Hard6) is a one-file additive
    change later
  - `LocalFilesystemStorageBackend` (dev fallback, .gitignored)
  - **No S3 secondary in this PR.** Documents foundation is
    single-storage at demo stage.
- Schema migration: extend `Document` with `storageBackend`,
  `storageKey`, `contentHash`, `mimeType`, `sizeBytes`,
  `extractedText`, `parentDocumentId`. **Without** `degraded`,
  `secondaryBackend`, `secondaryKey` fields (those land in
  PR-Hard6).
- New audit actions: `document.uploaded`, `document.retrieved`,
  `document.deleted`.
- New permissions: `documents:upload`, `documents:read`,
  `documents:delete`.
- Endpoints: `POST /api/documents/upload` (multipart),
  `GET /api/documents/[id]/content`.
- **Cockpit filter fix** bundled per operator instruction:
  filter for "awaiting triage" expanded from `stage === "new"`
  to `(stage === "new" || stage === "assigned") && !triagedBy`.
  Same fix to the header pill counter.
- Tests: storage backend interface contract (both
  implementations), audit emission, permission gating, Cockpit
  filter regression.

**Does NOT ship (deferred to PR-Hard rounds):**
- RLS policies (PR-Hard1)
- Virus scanning (PR-Hard2)
- PII redaction (PR-Hard2)
- Dual-write S3 (PR-Hard6)
- Structured-log sink integration (PR-Hard4)

**Estimated effort:** 3-4 days.

---

### PR-B — Playbook schema + admin editor + NDA seed

**Demo win:** Admin can configure NDA playbook positions from
`/admin/playbooks`. The agent doesn't use the playbook yet, but
the data is in place.

**Ships:**
- Schema migration: `Playbook` + `PlaybookEntry` +
  `PlaybookEntrySeverity` enum.
- Admin pages at `/admin/playbooks` (list) and
  `/admin/playbooks/[id]` (edit).
- Seed: one default NDA Playbook with 8 positions:
  1. Mutual vs unilateral confidentiality (BLOCKER)
  2. Term length ≤ 3 years (HIGH)
  3. Governing law in {DE, NY, CA} (HIGH)
  4. Carve-out for residual knowledge (MEDIUM)
  5. No injunctive relief asymmetry (MEDIUM)
  6. Definition of Confidential Information not overbroad (HIGH)
  7. Standard 1-year survival post-termination (LOW)
  8. No assignment without consent (LOW)
- New permissions: `playbook:read`, `playbook:write`.
- New audit actions: `playbook.*`.
- Tests: CRUD, default-uniqueness, audit emission.

**Estimated effort:** 2-3 days.

---

### PR-C — NDA agent v1 (paste-text mode → redlines)

**🎯 Demo win — FIRST HERO DEMO.** GC requester pastes an NDA
into the form → agent finds N deviations from the playbook →
Cockpit shows them with severity pills → attorney clicks Accept
on some, Reject on others, Edit-and-Accept on a few → revised
document appears.

**Ships:**
- `modules/intake/src/agents/redline/nda.ts` — implements
  `compose(documentText, playbook): Promise<AgentReview>` via
  `@aegis/ai.callClaudeJSON`. **Claude-only at demo stage** (no
  fallback chain yet — that's PR-Hard3).
- Schema migration: `AgentReview` model.
- New permission: `agent:redline:override`.
- New audit actions: `agent.review.produced`,
  `agent.review.redline.accepted`,
  `agent.review.redline.rejected`,
  `agent.review.redline.edited`,
  `agent.review.completed`.
- Form change: NDA-type tickets get a textarea ("Paste the NDA
  text here") in addition to the standard description field.
- Cockpit: when a ticket has an `AgentReview` row, render the
  new `RedlineViewer` component:
  - Document text on the left with inline highlighting per
    redline
  - Right rail: list of redlines with severity pill, position,
    rationale, suggested text, and three buttons (Accept,
    Reject, Edit-and-Accept)
  - Footer: "Decide all" affordance with paranoia type-to-
    confirm when ≥3 BLOCKERS are still PENDING (per A8)
- Generated revised document is stored as a child Document
  (`parentDocumentId` set).
- Optimistic locking on Redline state changes (per ADR-003) —
  ships from day 1, not as a hardening step.
- Tests: prompt composition, redline shape, accept/reject audit
  emission, RedlineViewer behavior per state.

**Does NOT ship:**
- File upload (PR-D)
- LLM fallback chain (PR-Hard3)
- PII redaction (PR-Hard2)
- Async streaming pipeline (PR-Hard4 — initial implementation
  is synchronous; UI shows "Reviewing…" spinner)

**Estimated effort:** 3-4 days. **This is the most important
demoable PR in the sequence.**

---

### PR-D — NDA agent v2 (real file upload + redlined .docx)

**Demo win:** Complete the loop. Counterparty sends a real .docx
NDA → uploaded via the form → agent extracts text + reviews →
attorney redlines → revised .docx with marked-up paragraphs
downloads back. End-to-end paper-in, paper-out.

**Ships:**
- Form change: file input for NDA tickets (.docx / .pdf only,
  ≤25 MB).
- Server-side text extraction (synchronous at demo stage; async
  worker comes in PR-Hard4):
  - `.docx` → `mammoth` npm — extracts plain text + paragraph
    structure
  - `.pdf` → `pdf-parse` npm — text-only PDFs (OCR for scanned
    PDFs deferred to post-MVP)
- Basic MIME validation via extension check + `Content-Type`
  header. **Magic-bytes sniff + virus scan land in PR-Hard2.**
- Generated revised document = `.docx` via `docx` npm with
  before/after paragraphs (full Word track-changes XML markup is
  a post-MVP polish item).
- Tests: extraction backends (both formats), generated .docx
  structure.

**Estimated effort:** 3-4 days.

---

### PR-E — Contract Review agent (full)

**Demo win:** Same shape as NDA but on a real MSA. ~40-60
playbook positions covering limitation of liability, indemnity,
IP assignment, termination convenience, payment terms, audit
rights. **The biggest-ROI demo** — "this saves a partner 4 hours
on every MSA review."

**Ships:**
- Same architecture as NDA (paste-text + file upload modes).
- Seed: Default Contract Playbook with ~50 positions.
- Per-agent prompt emphasising liability allocation + indemnity
  asymmetry (the high-value redlines for in-house).
- New entries in the request-type → agent map.
- Tests: playbook coverage, prompt regression on three sample
  anonymised MSAs (Snowflake-style, Stripe-style, AWS-style).

**Estimated effort:** 2-3 days (reuses infrastructure).

---

### PR-F — Privacy / DSAR agent

**Demo win:** Regulatory-pressure use case. Incoming DSAR →
agent assesses applicability (GDPR / CCPA / state-level) →
produces response template with deadline + required disclosures
populated.

**Ships:**
- Same architecture; specialised playbook for response cadence +
  required disclosures.
- **DRAFT mode**: generates DSAR response template.
- **REVIEW mode**: incoming request → checks against company
  policy + applicable regs.
- Tests: per-regulation behaviour.

**Estimated effort:** 2-3 days.

---

### PR-G — Vendor Due Diligence agent

**Demo win:** Procurement-adjacent. Vendor sends T&Cs → agent
flags deviations from our requirements (unlimited liability,
auto-renewal, data residency, subcontractor control, termination
notice, audit rights).

**Ships:**
- Same architecture; vendor-T&C playbook.
- REVIEW mode only (always incoming paper).
- Tests.

**Estimated effort:** 2 days.

---

### PR-H — Trademark Check agent

**Demo win:** Brand-team adjacent. Clearance search request →
agent generates summary + recommended next steps based on
jurisdiction + classes.

**Ships:**
- DRAFT mode primarily.
- Per-jurisdiction playbook (clearance rules vary by USPTO /
  EUIPO / WIPO).
- Tests.

**Estimated effort:** 2 days.

---

### PR-I — IP Question + Contract Question + Legal General

**Demo win:** Q&A agents covering the catch-all advisory cases.
Three agents share a common "Q&A base class" since their shape
is identical — only the prompt + playbook differ.

**Ships:**
- New `QAAgent` base class in `modules/intake/src/agents/qa/`.
- Three agent specialisations with their own prompts.
- DRAFT mode only.
- Routes to GC if confidence is low.
- Tests.

**Estimated effort:** 3 days (three agents, shared base).

---

### PR-J — Other (routing-only)

**Demo win:** Last of the 9. Catch-all type — no agent
automation; pure routing decision.

**Ships:**
- Form change: "Other" requests skip the agent layer entirely.
- Routing rule sets `assignedToUserId` based on department +
  urgency.
- Tests.

**Estimated effort:** 1 day.

---

### PR-K — First-paying-customer-ready (GDPR + retention + eDiscovery)

**Demo win:** Closes the compliance loop. After this PR, the
system is ready for the first external contract.

**Ships:**
- GDPR right-to-erasure workflow (request → conflict-with-
  legal-hold detection → cryptographic PII erasure +
  audit-row).
- `RetentionPolicy` schema + admin editor.
- Defensible deletion job (scheduled, captures certificate).
- Signed eDiscovery export (PDF + JSON, anchored in audit
  chain).
- Tests: GDPR erasure roundtrip, retention expiry, eDiscovery
  export verifiability.

**Estimated effort:** 4-5 days.

---

## Hardening track (6 PRs)

Each hardening PR addresses one production dimension from the
architecture doc. They're inserted into the sequence at the
point where their risk becomes binding.

### PR-Hard1 — Multi-tenancy hardening (RLS + CI test)

**When:** After PR-D (first hero demo working end-to-end on
single-tenant assumptions). **Before** PR-E ships a second
agent that broadens the attack surface.

**Why now:** Multi-tenant isolation is a **zero-tolerance**
SLO. Before any code that's hard to retrofit lands, RLS becomes
the substrate.

**Ships:**
- Postgres RLS policies on every org-scoped table
- Connection-level `SET app.org_id` middleware
- Cross-tenant isolation test as **pre-merge CI required check**
- Audit row on RLS-blocked attempts (`security.cross_tenant.blocked`)

**Estimated effort:** 2-3 days.

---

### PR-Hard2 — PII redaction layer + content classification

**When:** After PR-E (Contract Review). MSAs and contracts
carry the highest concentration of regulated PII.

**Why now:** Before more agents (Privacy, Vendor DD,
Trademark, IP) compound the PII exposure.

**Ships:**
- `@aegis/log-redaction` package with US PII patterns
- Redaction-before-vendor pipeline integrated into every agent
  Claude call
- `Document.classification` enum + per-doc classification at
  upload
- Vendor-opt-out for PRIVILEGED classification
- Magic-bytes MIME sniffing (real, not header trust)
- Virus scanning (Cloudflare Scanner or AWS Lambda + ClamAV)
- Decompression-bomb detection on Office files
- `@aegis/log` package with no-document-content guard
  (build-time + runtime + ESLint rule)

**Estimated effort:** 3-4 days.

---

### PR-Hard3 — Reliability (LLM fallback chain + circuit breakers)

**When:** After PR-G (Vendor DD). At this point we have 4
agents reliably calling Claude — Anthropic outage risk becomes
binding.

**Why now:** The first multi-agent Anthropic outage will be a
visible quality incident across all 4 agents simultaneously.

**Ships:**
- 4-tier degradation chain (Claude 4.6 → Claude 4.5 → GPT-4 →
  deterministic regex)
- Circuit breaker per tier
- Status-page integration with vendor health pull
- Audit row on every tier-fallback engagement
- Async streaming pipeline (SSE redline-by-redline) — needed
  here because the GPT-4 fallback has different latency
  characteristics
- Tests: tier cascade behaviour, breaker state machine,
  stream-correctness under tier switch

**Estimated effort:** 4 days.

---

### PR-Hard4 — Observability (Sentry + structured logs + metrics)

**When:** After PR-I (Q&A agents). Going from 7 to 8 agents
moves us into "operations matter" territory.

**Why now:** Before the first paying customer, we need real
on-call readiness. Console logs aren't enough.

**Ships:**
- Sentry wired (errors + warnings)
- Vercel Log Drains → Logtail (structured logs)
- `@aegis/metrics` package (Prometheus-format export)
- OpenTelemetry tracing (Claude calls as spans)
- SLO burn-rate alerts (latency, error rate, tier engagement,
  cross-tenant)
- Runbooks under `docs/runbooks/` for each alert
- On-call rotation tooling integration

**Estimated effort:** 3-4 days.

---

### PR-Hard5 — Rate limiting + cost control

**When:** After PR-J (Other agent — all 9 shipping). Volume
risk peaks here.

**Why now:** With all agents live, a runaway loop or bad actor
could 10x Claude spend overnight. Hard budgets become
load-bearing.

**Ships:**
- `OrganizationAgentBudget` model
- Per-org daily token budget with hard cutoff at 100%
- Alerts at 50% / 80% (email admin)
- Per-user hourly request cap
- Pre-flight token estimate in form UI
- Audit row per Claude call with token count + cost estimate
- Admin dashboard for spend monitoring

**Estimated effort:** 2-3 days.

---

### PR-Hard6 — Failover (S3 secondary + dual-write + hash verification)

**When:** Just before PR-K (first-customer-ready). Last
hardening before external contract.

**Why now:** Document loss is **zero-tolerance**. Before any
external party's NDAs are stored, dual-write is non-
negotiable.

**Ships:**
- `S3StorageBackend` implementation of `StorageBackend`
- Schema migration: add `degraded`, `secondaryBackend`,
  `secondaryKey`, `lastIntegrityCheckAt`,
  `lastIntegrityCheckPassed` to `Document`
- Dual-write on upload; hash verification on retrieve
- Reconciliation cron (nightly)
- Sampled integrity check (weekly, 1% of docs)
- Cross-region S3 replication for production
- Quarterly DR drill runbook in `docs/runbooks/`

**Estimated effort:** 3-4 days.

---

## Documented exceptions table (additions when PRs land)

Each row added to the master table in `CLAUDE.md` when its PR
lands. Sunset conditions explicit.

| Site | Sunset / permanent? | Lands in |
|---|---|---|
| `@aegis/documents.LocalFilesystemStorageBackend` | **Permanent fallback** for dev. Production fail-loud guard mirrors `AUTH0_SECRET`. | PR-A |
| `MockNDAAgent` (deterministic stub for CI / no-API-key) | **Permanent fallback** when `ANTHROPIC_API_KEY` unset. Real Claude in prod. | PR-C |
| Synchronous text extraction (no async worker) | **Sunset at PR-Hard3** (async streaming pipeline). | PR-D |
| Single-storage Vercel Blob (no S3 secondary) | **Sunset at PR-Hard6.** | PR-A |
| Console-log observability (no Sentry / metrics / tracing) | **Sunset at PR-Hard4.** | PR-A through PR-Hard3 |
| App-layer-only org isolation (no RLS) | **Sunset at PR-Hard1.** | PR-A through PR-D |
| No PII redaction before Claude | **Sunset at PR-Hard2.** | PR-A through PR-E |
| No LLM fallback chain (Claude-only) | **Sunset at PR-Hard3.** | PR-A through PR-G |
| No per-org budget enforcement | **Sunset at PR-Hard5.** | PR-A through PR-J |
| No GDPR right-to-erasure | **Sunset at PR-K.** | PR-A through PR-Hard6 |

## Demo arc — what the operator sees as PRs land

| After PR | Visible demo win |
|---|---|
| PR-A | Cockpit shows new tickets correctly; admin can see Documents API; foundation in place |
| PR-B | Admin can configure NDA playbook from `/admin/playbooks`; 8 default positions seeded |
| **PR-C** | **🎯 FIRST HERO DEMO.** Paste-text NDA → agent finds 5 deviations → Cockpit shows them → attorney approves with one keystroke per redline → revised document appears |
| PR-D | Real .docx upload + redlined .docx download. Counterparty paper-in, paper-out |
| PR-Hard1 | (Silent) Cross-tenant isolation now enforced by Postgres, not just code review |
| PR-E | Real MSA review demo — 40-60 deviations on a sample contract. The highest-ROI demo |
| PR-Hard2 | (Silent) PII no longer goes to Claude in plaintext; privileged docs respect classification |
| PR-F | DSAR response generation demo |
| PR-G | Vendor T&C review demo |
| PR-Hard3 | (Silent) Anthropic outage no longer takes down the workflow — tier cascade engages |
| PR-H | Trademark clearance demo |
| PR-I | Q&A agents demo (IP, Contract, Legal General) |
| PR-Hard4 | (Silent) Sentry catches errors; on-call has runbooks; SLOs monitored |
| PR-J | "Other" routing — all 9 agents shipping |
| PR-Hard5 | (Silent) Per-org budgets enforced; admin spend dashboard |
| PR-Hard6 | (Silent) Documents now dual-written to S3 secondary; hash-verified on every read |
| **PR-K** | **🎯 FIRST-PAYING-CUSTOMER-READY.** GDPR erasure works; retention policies configurable; eDiscovery export signed and verifiable |

## Risk register

Risks I'm tracking that aren't captured in dimensions:

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Playbook quality is the bottleneck, not infrastructure | High | High | Defer to operator: seeded NDA playbook gets tuned weekly during PR-C-PR-D iteration; Contract playbook gets a domain expert review before PR-E |
| Claude prompt regressions break working demos | Medium | Medium | PR-Hard4 includes prompt-regression test suite using anonymised real documents as fixtures |
| OCR demand from scanned PDFs surfaces early | Medium | Low | Honest "scanned PDFs not yet supported" UX in PR-D; OCR becomes a post-MVP PR |
| First customer demands BYOK Claude key | Medium | Medium | Architecture supports it (per-org-keyed Anthropic client); we ship if a customer signs contingent on it |
| `.docx` track-changes output isn't true Word XML | High | Low | Honest before/after-paragraph display in PR-D; full track-changes XML becomes a post-MVP polish PR |
| Mid-market price expectations don't cover Claude cost | Medium | High | PR-Hard5 budget controls let us tier customers; can fall to cheaper Claude variant for budget tiers |

## Timeline summary

| Phase | PRs | Effort | Cumulative |
|---|---|---|---|
| Foundation | PR-A | 4 days | week 1 |
| First hero demo | PR-B + PR-C | 6 days | week 3 |
| End-to-end NDA | PR-D | 4 days | week 4 |
| Multi-tenancy hard | PR-Hard1 | 3 days | week 4 |
| Contract Review | PR-E | 3 days | week 5 |
| PII / classification | PR-Hard2 | 4 days | week 6 |
| Privacy + Vendor | PR-F + PR-G | 5 days | week 7 |
| Reliability hard | PR-Hard3 | 4 days | week 8 |
| Trademark + Q&A + Other | PR-H + PR-I + PR-J | 6 days | week 10 |
| Observability hard | PR-Hard4 | 4 days | week 11 |
| Rate limit hard | PR-Hard5 | 3 days | week 12 |
| Failover hard | PR-Hard6 | 4 days | week 13 |
| First-customer-ready | PR-K | 5 days | **week 14** |

**Total: ~14 weeks** from operator green-light to first paying
customer. ~4 weeks to the first hero demo (PR-C).
