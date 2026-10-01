# ONE Legal → the agentic front door (Cowork / Harvey / Legora feel)

> How every legal task flows through **ONE Legal**, and what we build to get
> there. This is a roadmap grounded in what AEGIS already has — most of the
> platform exists; the work is orchestration, not invention.
>
> Companion to [`docs/intake-roadmap.md`](./intake-roadmap.md). Honors every
> non-negotiable in [`CLAUDE.md`](../CLAUDE.md) (11 modules locked, module
> isolation, all AI through `@aegis/ai`, all data through `@aegis/db`, every
> AI mutation gated by `AgentDecision` + chain-sealed audit, the demo never
> breaks).

---

## 1. The goal in one paragraph

ONE Legal becomes the single place a GC or their team starts **any** legal
work — an NDA, a dispute, a vendor screen, a DSAR, a board matter. You
describe it in plain language; ONE Legal **decomposes it into a plan of
governed tasks**, executes them across the 11 modules (each module's
`api.ts` is the tool surface), **streams progress** into a Claude-Cowork-style
workspace (chat + right rail of Progress / Working folder / Context /
Skills), produces **artifacts** (drafts, holds, review sets, packages), and
gates every AI-taken action behind a human approve keystroke that writes an
`AgentDecision` and a chain-sealed `AuditLog` row. Same feel as Harvey and
Legora — but on **one brain** with governance enforced in the schema, not
bolted on.

---

## 2. What "the feel" actually is (the converged incumbent pattern)

Harvey, Legora and Claude Cowork have converged on the same loop:

**Describe → plan → execute (often in parallel) → review → artifacts**, inside
a workspace shell (a chat column + a side rail showing the plan, the files
being produced, the tools/connectors in play, and the skills available).

- **Claude Cowork** — you describe a task, Claude builds an *execution plan*,
  shows *progress indicators*, spins up *sub-agents for parallel workstreams*,
  reaches for *connectors first*, keeps a *Working folder* of files, and lets
  you bundle *Skills* (connectors + sub-agents) into a role specialist.
  ([overview](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork),
  [product](https://claude.com/product/cowork))
- **Harvey** — four surfaces: **Assistant** (chat/draft/analyze), **Vault**
  (bulk cross-document review), **Knowledge** (cited research), **Workflow
  Agents** (no-code multi-step). Agents run *plan → execute sub-tasks →
  evaluate → adjust* loops; 500+ prebuilt agents + an Agent Builder.
  ([agents](https://www.harvey.ai/blog/introducing-harvey-agents),
  [workflow agents](https://www.harvey.ai/platform/workflow-agents))
- **Legora** — agentic **Workflows** that reason step-by-step, **Tabular
  Review** (structured grid for high-volume diligence), collaboration
  guardrails (Mark-as-Reviewed, Lock Cells, Review Mode), redlining/DMS/
  research tooling, "human oversight built in."
  ([2026: year of agents](https://legora.com/blog/2026-the-year-of-agents-in-legal-ai),
  [tabular review](https://legora.com/product/tabular-review))

Every one of those surfaces already has an AEGIS analog:

| Incumbent surface | AEGIS equivalent (exists today) |
|---|---|
| Cowork "describe → plan → progress" | `CommandConsole` streamed plan over `/api/intake/request-stream` |
| Cowork right rail (Progress / Working folder / Context / Skills) | **shipped** — `WorkspaceRail` in `CommandConsole.jsx` |
| Cowork Skills (bundle of capabilities) | the 11 oKF agents + `GOVERNANCE_LIBRARY` ladders |
| Harvey Assistant (chat/draft/analyze) | ONE Legal Q&A + `draftContractWithAI` / `renderAgentDeliverableDocx` |
| Harvey Vault / Legora Tabular Review | `packages/review` cockpit (`ReviewStep`, batching, coding, produce) |
| Harvey Workflow Agents | `packages/workflow` engine + `agent-tasks` runner |
| "human oversight built in" | `AgentDecision` gate — **schema-enforced**, stronger than any incumbent |

The point: we are not building an agent platform. We are **wiring the pieces
we already have into the ONE Legal shell.**

---

## 3. What AEGIS already has (the 80%)

Grounded inventory (file paths + exact names) of the primitives ONE Legal
will orchestrate.

### 3.1 An agent runtime that produces recommendations (never mutates)
- 11 agents registered in `modules/intake/src/agents/index.js`
  (`processTicketWithAgent`, `routeToAgent`, `AGENTS_BY_ID`).
- A **generic oKF runtime** `modules/intake/src/agents/okf/runtime.js`
  (`runDefinition`) that executes any published `AgentDefinition` with a
  JSON → text → deterministic **degrade ladder**; its invariant is
  *"produces a recommendation; never sends, never mutates."*
- `executionMode` split: `"okf"` (pure-prompt, Designer-driven) vs `"code"`
  (a deterministic step GATES the action). Server execution +
  persistence: `modules/intake/src/agents/run-server.ts`
  (`runAgentForTicketServer`, `runLadderAgentForTicket`).

### 3.2 A human-approval gate enforced in the schema (the moat)
- `AgentDecision` model (`packages/db/prisma/schema.prisma`) — **polymorphic**
  (`resourceType` / `resourceId`), so it can gate **any** resource, with
  `approvalStatus PENDING → APPROVED | APPROVED_WITH_OVERRIDE | REJECTED`,
  `promptHash`, `confidence`, `resultingAuditLogId`.
- Enforcement: `modules/intake/src/agent-decision/server.ts`
  (`syncAgentDecisionForTicket`, `isTicketAgentActionApproved`). **Gate
  contract:** a recommendation writes a PENDING decision; the only path off
  PENDING is a human approve/reject keystroke; downstream mutations refuse
  unless APPROVED; resolved decisions are immutable evidence.
- Today only intake (`resourceType="IntakeTicket"`) and a few AI features
  (contract narrative/clause-remediation, spend judgment, privacy relevance)
  write decisions — **the table is ready to gate everything.**

### 3.3 A workflow engine + a governance-ladder library
- `packages/workflow` — `startWorkflow`, `actOnWorkflow`,
  `autoAdvanceOpeningStep`, `runAgentTask` / `autoRunCurrentAgentStep`.
  Definitions are data (`WorkflowStep` with `kind: HUMAN | AGENT`,
  `approverRole`, `slaHours`); every movement twin-records a
  `WorkflowTransition` + chain-sealed `AuditLog`; AGENT steps queue a
  PENDING `WorkflowAgentTask` and never auto-approve AI.
- `GOVERNANCE_LIBRARY` (`packages/workflow/src/library.ts`) — **10 ready
  ladders**: `nda_fasttrack, clm_contract_approval, patent_litigation,
  legal_notice, regulatory_response, vendor_onboarding,
  compliance_investigation, data_breach, employment_matter, board_approval`.
  Their AGENT steps already bind to the 11-agent registry.

### 3.4 A tool surface per module (what a task can *do*)
Each module's `api.ts` is a catalog of governed mutations/reads ONE Legal
can call. Highlights:
- **Matter** — `createMatter`, `transitionMatterStatus`, `closeMatter`,
  `createInvestigation`, `createLegalHold` / `issueLegalHold` /
  `releaseLegalHold`, `issueHoldWithProgressGen` (SSE), `createMatterArtifact`.
- **Contracts** — `spawnContractFromIntake`, `authorContractFromTemplate`,
  `draftContractWithAI`, `generateContractDocx`, `submitContractForApproval`,
  `requestSignature`, `reviewThirdPartyContract`.
- **Spend** — `runInvoiceReview`, `proposeInvoiceJudgment` /
  `resolveInvoiceJudgment` (AgentDecision-gated), `approveInvoice`.
- **Privacy** — `createDsarRequest`, `runRelevanceReview`,
  `collectFromM365`, `assembleResponsePackage`, `deliverDsar`,
  `createAssessment`.
- **Review (eDiscovery)** — `persistReviewSet`, `runAiReviewOnReviewSet`,
  `createReviewBatch`, `produceReviewSet`, and crucially the **autopilot**:
  `startAutoPilot` / `approveAutoPilotStep` / `rejectAutoPilotStep` /
  `planSteps` / `critique` — *the one human-gated multi-step executor that
  already exists*, and the template for the ONE Legal orchestrator.
- **Admin** — `inviteUser`, `updateUserRole`, `updateRolePermissions`.

### 3.5 Streaming + artifacts + permissions
- **SSE pattern**: `issueHoldWithProgress` (async generator yielding
  `step_started | step_succeeded | step_failed | complete`) behind
  `/api/matter/[id]/holds/[holdId]/issue-with-progress`, consumed by the same
  reader loop `CommandConsole.jsx` already uses. This is the substrate for
  streaming a whole task graph.
- **Artifacts**: the shared `Document` entity + `createMatterArtifact`
  (Document-backed, `ARTIFACT_PREFIX`), `renderAgentDeliverableDocx`
  (`@aegis/documents`) turns any recommendation into a .docx,
  `generateContractDocx`, `produceReviewSet` (Bates production).
- **Permissions**: `Permission` enum (40 values) + `assertUserCanDo` at every
  chokepoint.

---

## 4. The gap (the 20% to build)

1. **No unified task model.** ONE Legal shows a *plan* of pipeline steps, but
   there is no first-class "task" a request decomposes into, no persistence,
   no cross-module task graph.
2. **No cross-module orchestrator.** Each module exposes discrete gated
   mutations; only `packages/review` has an *orchestrated* multi-step runner
   (autopilot). Nothing turns "we're being sued by Acme" into
   `open matter → issue hold → start review → notify` as one governed run.
3. **`AgentDecision` gating is intake-only in practice.** The table is
   polymorphic and ready; other modules mostly gate via their own paths.
4. **No tool registry.** The `api.ts` functions exist but aren't declared as
   a callable, permission-checked tool catalog an agent can select from.
5. **Intake has no `api.ts`** yet (its `internal`/`api` split is the deferred
   "Step 5"), so ONE Legal reaches intake internals via subpath exports.

---

## 5. Target architecture

```
        ┌──────────────────────── ONE Legal (apps/web) ────────────────────────┐
        │  Chat column            Right rail: Progress · Working folder ·        │
        │  (describe / approve)              Context · Skills   ← shipped        │
        └───────────────┬───────────────────────────────────────────────────────┘
                        │  POST /api/one-legal/run  (SSE, task-graph stream)
                        ▼
        ┌──────────────── @aegis/orchestrator (new, thin) ─────────────────┐
        │  planTasks(request)   → Claude decomposes into typed LegalTask[]  │
        │  runTaskGraph(tasks)* → async generator, executes via Tool Registry│
        │  each AI task → AgentDecision(PENDING) → human approves in ONE     │
        │  Legal → execute → chain-sealed audit → emit artifact             │
        └───────────────┬──────────────────────────────────────────────────┘
                        │  Tool Registry (declarative: name → module api.ts fn + Permission)
        ┌───────────────┴───────────────────────────────────────────────────┐
        │ matter.createMatter · matter.issueLegalHold · contracts.draftWithAI │
        │ contracts.spawnFromIntake · spend.runInvoiceReview · privacy.createDsar│
        │ review.startReviewSet · review.startAutoPilot · intake.fileTicket …  │
        └────────────────────────────────────────────────────────────────────┘
                        │  one brain: @aegis/db shared entities + AuditLog chain
```

Principles:
- **The orchestrator only plans and gates.** It never mutates directly — it
  calls the module `api.ts` tool, and every AI-chosen mutation writes an
  `AgentDecision` first (mirrors the oKF runtime invariant).
- **Reuse, don't reinvent.** The task-graph generator is modeled on
  `issueHoldWithProgress` (streaming) and `packages/review` autopilot
  (plan → critique → human-approve → execute).
- **Tools are declarative + permission-checked.** A tool = `{ name, permission,
  run(input, actor) }` wrapping an existing `api.ts` function; the registry is
  the single source of truth for "what ONE Legal can do."
- **The rail becomes real.** Progress = live task graph; Working folder =
  `Document`/artifact rows produced; Skills = agent registry + ladders;
  Context = tools/connectors invoked (incl. Laya System-1, M365, web).

---

## 6. Phased plan (PR-sized; demo green at every step)

**OL-1 — Compound-request planning (client-first, no schema).**
Generalize the console plan: when a request is compound ("sued by Acme —
open a matter and put a hold on the deal team"), call `callClaudeJSON` to
decompose into a typed task list and render each as its own Progress row.
Single-request fast path unchanged. *Ships the multi-task feel with zero
backend risk.*

**OL-2 — Tool Registry + Orchestrator service + SSE route.**
New `@aegis/orchestrator` (or `modules/intake/src/orchestrator`): a
declarative registry mapping task types → `api.ts` fns + `Permission`;
`runTaskGraph` async generator; `POST /api/one-legal/run` streaming
`task_started | task_needs_approval | task_succeeded | task_failed |
artifact | complete`. Modeled on `issueHoldWithProgress` + review autopilot.

**OL-3 — Universal `AgentDecision` gating.**
Every orchestrated AI mutation writes a PENDING `AgentDecision`
(`resourceType` per module) and blocks until the ONE Legal **Approve**
keystroke flips it. Extends the intake gate contract platform-wide — the
governance moat, now everywhere.

**OL-4 — Persist the run (`ConsoleSession` + `LegalTask`).**
Additive schema so a run survives reload, appears in the Working folder,
is resumable, and is fully audited. `LegalTask` links to its resource +
its `AgentDecision` + resulting artifact.

**OL-5 — Artifacts in the Working folder.**
Route `renderAgentDeliverableDocx` / `createMatterArtifact` /
`generateContractDocx` / `produceReviewSet` outputs into the rail with
open/download — the drafted NDA, the defensibility export, the production
set, all visible where they were produced.

**OL-6 — Skills = agents + ladders, runnable from ONE Legal.**
Surface the 11 agents and the 10 `GOVERNANCE_LIBRARY` ladders as selectable
"skills" (Harvey Workflow-Agents analog); "run the NDA fast-track ladder"
starts a governed workflow from the console.

**OL-7 — The cross-module demo spine.**
One request → many governed tasks end-to-end:
*"Acme served us"* → `createMatter` → `issueLegalHold` (streamed) →
`persistReviewSet` + `startAutoPilot` → notice. Proves "all tasks through
ONE Legal."

**OL-8 — Parallel sub-agents (Cowork-style).**
Independent tasks run concurrently (the `agent-tasks` runner + review
autopilot give the substrate); the rail shows parallel workstreams.

**Enabler — Intake `api.ts` split (the deferred Step 5)** so ONE Legal
consumes a clean public intake surface instead of subpath internals.

---

## 7. Why this beats Harvey / Legora for a GC

- **One brain.** Every task reads/writes the *same* `Counterparty`, `Matter`,
  `Document`, `Obligation` — no per-tool data silos. Incumbents integrate
  across products; AEGIS is natively unified.
- **Governance in the schema, not the prompt.** The `AgentDecision`
  PENDING→APPROVED gate + append-only chain-sealed `AuditLog` is enforced by
  Postgres triggers and the persistence layer — a defensibility story no
  prompt-level "human oversight" can match.
- **Degrade-to-deterministic.** Every AI step has a deterministic floor
  (regex classifier, deterministic scorecards, Laya System-1), so the console
  never stalls when a model is down.
- **Self-hosted System-1.** Laya (JEV-compatible, Apache-2.0) does triage/
  classification cheaply on-prem — confidential text never leaves the tenant.

---

## 8. Non-negotiables this plan honors

- The 11 modules stay locked; the orchestrator is a **composition layer**, not
  a 12th module (it lives in `apps/web` + a thin package, calling `api.ts`).
- Module isolation intact: the orchestrator calls each module's **public
  `api.ts`**, never its internals.
- All AI through `@aegis/ai`; all data through `@aegis/db`.
- Every AI mutation → `AgentDecision` + chain-sealed audit. No bypass.
- The v8 Intake demo keeps working end-to-end at every checkpoint.

---

## 9. Recommended first move

**OL-1 then OL-2.** OL-1 lands the compound-task feel immediately with no
backend risk; OL-2 makes it real with the orchestrator + tool registry and
the streaming `/api/one-legal/run` route. Everything after is additive.

---

## 10. Live status tracker (updated as PRs land)

Legend: 🔴 not started · 🟡 in progress / in review · 🟢 mitigated · ✅ done.

### Shipped recently (foundation + fixes)
| ID | Item | Status |
|---|---|---|
| F-1 | Embeddings service on Railway (`services/embeddings`) | ✅ Live |
| F-2 | Laya System-1 classifier on Railway (`services/laya`) | ✅ Live (#469) |
| F-3 | Next.js 14.2.35 security bump (CVE-2025-55184 / -67779) | ✅ #470 |
| F-4 | pgvector migration + backfill workflow + embed sub-batching | ✅ #471–#473 (51–52/52 indexed) |
| FX-1 | Intent routing: operational queries answered, not filed ("total open contracts") | ✅ #474 |
| F-5 | End-to-end semantic search verification (smoke test in ONE Legal) | 🟡 pending user test |

### Open foundation
| ID | Item | Why | Priority | Status |
|---|---|---|---|---|
| F-6 | Async worker runtime (pg-boss) for scheduled jobs | SLA sweeps, defensibility snapshots, obligation alerts (C-9) | P2 | 🔴 |
| F-7 | KMS envelope encryption for stored M365 creds / refresh tokens | Replace dev-only plaintext before first paying customer | P2 | 🔴 |
| F-8 | Shared connector / OAuth framework | Base for DMS (C-3), e-sign (C-5), legal research (C-4) | P1 | 🔴 |

### Cowork-feel near-term (extends OL-1 / OL-5)
| ID | Item | Maps to | Priority | Status |
|---|---|---|---|---|
| CW-1 | **Clarify-before-file** — interview for missing details first (Cowork-style) | new; feeds OL-1 | P0 | 🔴 next |
| CW-2 | Doc-type disambiguation ("sell IP" ⇒ NDA vs assignment/license) | folds into CW-1 / OL-6 | P1 | 🔴 |
| CW-3 | Jurisdiction-aware template variant up front (India ≠ Delaware-then-flag) | folds into OL-6 | P1 | 🔴 |
| CW-4 | Attorney-grade `.docx` deliverable → edit → approve → send back to requester | = OL-5 | P1 | 🔴 |
| CW-5 | Cockpit RFI round-trip (questions back to requester) | new; pairs with C-10 | P2 | 🔴 |

> The **OL-1…OL-8** plan in §6 remains the orchestration backbone (all 🔴 not started). CW-* above are the immediate Cowork-feel wins layered on it; CW-4 is OL-5, CW-2/3 ride OL-6.

---

## 11. Competitive gap matrix & table-stakes epics (C-1…C-14)

§7 argues *why* AEGIS beats the incumbents on breadth + governance. This section is the complement: the **table-stakes gaps** to close so AEGIS isn't disqualified in head-to-head evals against **Harvey / Legora / Icertis**. Competitor features verified via web research (Oct 2026): [Harvey platform](https://www.harvey.ai/platform) · [Legora product](https://legora.com/product/aos) · [Icertis Vera](https://www.icertis.com/products/platform/copilot/).

### Where AEGIS already has parity / wins
| Capability | Harvey | Legora | Icertis | AEGIS | Verdict |
|---|:--:|:--:|:--:|---|---|
| Cited Q&A over your own docs | ✅ | ✅ | ✅ | ✅ K1 (self-hosted) | parity |
| Bulk / tabular multi-doc review grid | ✅ | ✅ | ~ | ✅ `packages/review` + Vault V1c | parity |
| Agentic workflows / ladders | ✅ | ✅ | ✅ | 🟡 engine + `GOVERNANCE_LIBRARY`, orchestrator pending (OL-2) | close |
| Breadth across legal-ops lifecycle | ❌ | ❌ | ❌ | ✅✅ | **AEGIS wins** |
| Chain-sealed audit + human-gate governance | ~ | ~ | ~ | ✅✅ | **AEGIS wins** |
| Legal hold / eDiscovery | ❌ | ❌ | ❌ | ✅✅ | **AEGIS wins** |

### Competitive epics
| ID | Area | Item | Parity with | Priority | Depends | Status |
|---|---|---|---|---|---|---|
| C-1 | Surface | **Word add-in** (native track-changes drafting/redline) | Legora, Harvey | P1 | CW-4 | 🔴 |
| C-2 | Surface | **Outlook add-in** (email drafting/triage) | Harvey | P2 | F-8 | 🔴 |
| C-3 | Connectors | **DMS/storage sync** — iManage, NetDocuments, SharePoint | Harvey, Legora | P1 | F-8 | 🔴 |
| C-4 | Research | **Legal-authority research** — caselaw/statute/EDGAR/EUR-Lex (connector or content provider) | Harvey, Legora | P1 | F-8 | 🔴 **biggest gap** |
| C-5 | Contracts | **E-signature** — real DocuSign/Adobe (seam stubbed in NDA flow) | Icertis | P1 | F-8 | 🔴 |
| C-6 | Enterprise | **SSO / SAML federation** — Auth0 → Entra/Okta per tenant | all three | P1 | — | 🔴 (migration documented) |
| C-7 | Contracts | **Contract authoring** — clause library + templates + dynamic clause insertion | Icertis | P2 | — | 🔴 (`authorContractFromTemplate` exists) |
| C-8 | Contracts | **Negotiation intelligence** — redline summaries, playbook fallbacks, version compare | Icertis, Legora, Harvey | P2 | C-7 | 🔴 |
| C-9 | Contracts | **Obligation & renewal management** — auto-extract post-signature, assign, track, alert | Icertis | P2 | F-6 | 🔴 (uses `Obligation` entity) |
| C-10 | Collaboration | **Business-user / client portal** — white-label self-service | Legora Portal, Icertis | P2 | CW-5 | 🔴 |
| C-11 | Reach | **Multilingual / multi-jurisdiction** drafting & review | Legora | P3 | — | 🔴 |
| C-12 | Platform | **Expose AEGIS as an MCP server** (integration surface) | Harvey | P3 | — | 🔴 |
| C-13 | Quality | **Answer-grounding / citation enforcement + legal hallucination guardrails** | quality bar | P1 | — | 🔴 (extends SEC1 + governance) |
| C-14 | Analytics | Executive analytics / reporting depth (Mission Control) | Icertis analytics | P3 | — | 🔴 |

### Suggested strategic sequence
Close semantic loop (F-5) → Cowork-feel (CW-1 → OL-1/OL-2 → CW-4/OL-5) → quality bar (C-13) → win-rate movers (C-4 research + C-1 Word add-in on the F-8 framework) → contract depth (C-7 → C-8 → C-9 with F-6) → enterprise (C-6, F-7, C-10).

### Also considered (parked, not yet epics)
Data-residency / tenant-isolation hardening, mobile beyond custodian ack, usage metering/billing, prompt/agent versioning + in-prod evals (partly EVAL1/OBS1), SOC 2 / ISO 27001 (go-to-market, not code).
