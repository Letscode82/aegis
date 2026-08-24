# AEGIS close-out roadmap — one list, every pending plan

The single source of truth for finishing the eDiscovery / investigation /
review capability. Everything below is either **shipped**, **in flight**, or
**pending** with a concrete scope. The build order at the bottom is what we burn
down. The demo stays green at every checkpoint.

> Governance invariant (applies to everything here): every AI action that
> **mutates evidence or state** writes a PENDING `AgentDecision` and blocks on a
> human approve keystroke, and every mutation is chain-sealed in `AuditLog`.
> "Autonomous" never means "ungoverned."

---

## Shipped (recent)

| Area | Items |
|---|---|
| Collection | CW-1 (full body + attachment text), CW-2 (Purview tenant-scale estimate) |
| Processing | text-extract, cull (reversible + logged) |
| Review / AI | AIR-1/2/3/4 (5-dimension tags + citations + versioned profiles + pilot→validate→scale) |
| Investigations | INV-1 (source letter → issues → plan → matter), INV-2 (preserve & collect from the investigation), INV-3 (chronology), INV-4 (findings report) |
| Capstone | CAP-1 (Case Copilot chat), CAP-2 (Case Dossier DAG), CAP-3 (Case Knowledge Graph), CAP-4 (governed agent actions) |
| Fixes | investigation custodian search picker + dedup; Issue Hold no-notice path |

---

## NEW — CAP-5 · Case AutoPilot (single-prompt agentic orchestrator)

**The ask.** "Give a prompt at the start and — like Claude Code agents — at each
aspect the respective collection / processing / review tools execute, and finally
assemble the results." Today's Case Graph (CAP-2) is a **fixed, read-only DAG**
over an *already-collected* set. CAP-5 is the missing piece: a **planner + tool-use
loop** that drives the whole investigation from one directive, with graph memory
and a human gate at every evidence-touching step.

### Shape

```
directive ──▶ PLANNER (Claude, degrades to deterministic template)
                 │  emits a workplan DAG of typed steps, each bound to a tool
                 ▼
        ┌──────────────── LOOP (observe → decide → act → check) ───────────────┐
        │  pick next ready step from the graph                                  │
        │  READ tool  → runs freely (discover, estimate, graph, validate)       │
        │  MUTATING tool → writes PENDING AgentDecision → BLOCKS for approve ──┐ │
        │  write results into the Case Knowledge Graph (shared memory)        │ │
        │  CRITIC (reuses CAP-2 findGaps): done, or add a step (broaden /      │ │
        │  re-review / chase a gap)?  bounded by max-iters + token budget      │ │
        └──────────────────────────────────────────────────────────────────────┘
                 ▼
        assemble → Case Brief (the "context map") + dossier + chronology + report
```

### Tool registry (reuse existing services — no new brain, a new conductor)

| Tool | Backing service | Class |
|---|---|---|
| `discover_custodians` | `searchM365DirectoryUsers` | read |
| `estimate_scale` | `estimatePurviewCollection` (CW-2) | read |
| `preserve_and_collect` | `startInvestigationWorkup` (INV-2) | **mutating → gate** |
| `eca_cull` | ECA + cull services | **mutating → gate** |
| `ai_review` | `runAiReviewOnReviewSet` (AIR-3) | **mutating → gate** |
| `validate` | AIR-4 pilot (recall/precision/F1) | read/measure |
| `build_case_graph` | `runCaseGraph` (CAP-2/3) | read |
| `extract_chronology` | `suggestInvestigationFacts` + confirm | **mutating → gate** |
| `draft_report` | `buildInvestigationReport` (INV-4) | read |

### Graph engineering

- The workplan is a real dependency **DAG**, persisted as `CaseAutoPilotRun` +
  `CaseAutoPilotStep` (status, tool, inputs, outputs, `agentDecisionId`,
  `resultingAuditLogId`).
- The **Case Knowledge Graph (CAP-3)** is the loop's shared memory: entities,
  issues, and timeline nodes accumulate across steps; the planner chooses the
  next step from **graph gaps** (an unlinked custodian, an issue with no key
  doc, a date range with no coverage). This is the "second brain / context map"
  realized as a governed graph, not flat files.

### Governance

- READ/analysis tools run without a gate. Every **mutating** tool call writes a
  PENDING `AgentDecision` (CAP-4 machinery already built) and **pauses** the run
  until a human approves — the AutoPilot proposes the plan and runs the safe
  parts, then stops at each evidence-touching step for the approve keystroke.
- Live progress streams over SSE to an `AutoPilotPanel` (same pattern as the
  Hold Wizard `ProgressPanel`), showing each step, its tool, its gate, and its
  result.

### Deliverables

- `packages/review/src/autopilot.ts` — planner, loop, tool registry, critic.
- Schema: `CaseAutoPilotRun` + `CaseAutoPilotStep` (additive migration).
- Routes: `POST /api/review/collections/[id]/autopilot` (start, SSE),
  `GET .../autopilot/[runId]` (snapshot), approve/reject reuse CAP-4 endpoints.
- UI: `AutoPilotPanel` as a new Copilot tab ("AutoPilot") + a "Run AutoPilot"
  entry from the investigation row.
- Tests: planner determinism, loop termination, gate enforcement (a mutating
  step cannot run while its AgentDecision is PENDING).

---

## NEW — Legal Hold UX redesign (step-by-step + crisp)

**The ask.** The hold workspace (`HoldDetailPage`) is dense and hard to read —
cramped defensibility bars, tiny type, duplicate custodians. Hold work should be
a **clean step-by-step flow**.

### Plan

1. **Make the guided wizard the default creation path.** The 5-step Hold Wizard
   (4d.0: Scope & Trigger → Custodians → Data Sources → Notice → Review & Issue)
   already exists — route hold creation (incl. the investigation workup) through
   it instead of dropping the user onto the dense workspace, with a crisp
   horizontal stepper (the reference screenshot's pattern).
2. **Redesign the workspace as a calm read surface**, not a control panel:
   larger legible defensibility (real numbers, not 6 hairline bars), a clean
   status row, and custodians as the dominant panel. Actions live in the wizard
   / dialogs, not scattered across a wall.
3. **De-dupe custodians by email** in the roster (defensive) so the many
   near-identical `priya.kulkarni@…` rows collapse to one — pairs with the
   Person-dedup backlog item below.
4. **Crisp stepper component** in `@aegis/ui` (reused by the AutoPilot panel and
   any future multi-step flow).

---

## NEW — Produce → Relativity export (future integration)

In the Produce stage, alongside Bates production, add a **"Cull & export to
Relativity"** path: a load-file export (`.dat` / `.opt` Concordance format +
extracted text + native paths) of the culled, coded, non-privileged set, so a
customer can hand the AEGIS-reviewed set to Relativity for detailed review.
Stub-first (generate the load file + manifest; real RelativityOne API push is a
later connector). One documented exception if a stub is needed.

---

## Pending backlog (close each)

| ID | Item | Status | Notes |
|---|---|---|---|
| AIR-5 | Migrate DSAR review onto `@aegis/ai-review` | ⬜ | swap privacy's scorer; add citations/confidence to DSAR cards |
| AIR-6 | Batch runner (chunked, resumable) + AI-Validation dashboard | ⬜ | cron pattern + validation read per profile |
| ECA-1 | Dedup + email threading + inclusive-email | 🟥 partial | confirm flags on `ReviewSetItem` |
| ECA-2 | AI theme clustering (embeddings) + junk-domain quarantine | ⬜ | needs embeddings via `@aegis/ai` |
| Phase 3 | FOIA / subpoena / regulator response surface | ⬜ | reuses collection + review + production |
| Phase 4 | HOLD-N — live legal-hold notifications (real email send) | ⬜ | sunsets the notice-composer "Recorded" stub |
| Phase 5 | Privacy build-out (ROPA / consent / incidents on module #10) | ⬜ | DSAR shipped; siblings extend it |
| Phase 6 | Platform (saved searches, cross-module timeline, exports) | ⬜ | one build, every module benefits |
| DATA | Person dedup by (org, email) | ⬜ | kills the "many Priya Kulkarni" rows at the source |
| DEF-1 | PDF / DOCX / OCR text extraction | ⬜ deferred | today: text/* + csv/json/xml/html/rtf only |
| DEF-2 | Redaction burn-in (real image redaction) | ⬜ deferred | |
| DEF-3 | OKF export (agent-knowledge interop) | ⬜ deferred | bounded-yes; not for case/evidence data |
| 4d | Matter / Legal-Hold AI unfreeze (real Claude behind the mocks) | ⬜ frozen | unfreezes post-Intake per CLAUDE.md |

---

## Build order

1. **Legal Hold UX redesign** — loudest demo complaint, concrete, self-contained.
2. **CAP-5 · Case AutoPilot** — the headline "AI runs the investigation" capstone.
3. **Relativity export** in Produce (stub-first).
4. **ECA-2** (clustering) → **AIR-6** (batch + validation dashboard) →
   **AIR-5** (DSAR onto shared engine).
5. **Person dedup** (DATA) — quick, removes a recurring demo wart.
6. **Phase 3/4** (FOIA, HOLD-N) — independent quick wins.
7. **Phase 5/6**, then the deferred DEF-* items and 4d unfreeze.

Each lands as one PR (or a small sub-PR series), demo green throughout.
