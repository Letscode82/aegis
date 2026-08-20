# Case Intelligence roadmap — from collection to "solve the case"

This document does two things:

1. **Change log** — what the recently-merged PRs (CW-1, CW-2, AIR-2, AIR-4,
   INV-1) actually changed in **collection**, **processing**, and **review /
   AI review**.
2. **Forward plan** — ECA-3 (next), the Investigations spine (INV-2/3/4), and
   the capstone **Case Graph** — a Claude-native review copilot + an agent
   graph that produces case results, going beyond incumbent review tools.

All of it honors the three non-negotiables: the **11-module lock** (new
capability lives in `packages/*` + `apps/web` composition, never a 12th
module), **conservative AI governance** (agents *propose*; a human *approves*;
every state change is chain-sealed), and the **deterministic floor** (works
with no API key / no tenant).

---

## Part 1 — What changed in the merged PRs

### Collection (getting data in)

| PR | Change |
|---|---|
| **CW-1** | `searchForDataSubject` (the per-user Graph collector used by holds, DSARs, investigations) now pulls the **full email body** (HTML → text) instead of `bodyPreview`, and downloads **attachment `contentBytes`** and extracts **text-based attachment content** (`text/*`, csv, json, xml, html, rtf). Every collected item and its attachment children now carry real searchable text, not just filenames. Zero-dependency; PDF/DOCX/OCR deferred. |
| **CW-2** | New `estimatePurviewCollection` on the `M365Client` interface + a shared Graph helper: creates/reuses a Purview eDiscovery case, adds a custodian-scoped search + KQL, runs `estimateStatistics`, and reads back **tenant-wide item count / data volume / mailbox & site coverage** — the *enterprise-scale* answer ("how big is this across the whole tenant") without pulling per-user. Routed delegated-first, app-only fallback, mock (`SIMULATED`) in dev. Surfaced as **Estimate scale (Purview)** in the eDiscovery hub. |

**Net:** two collection modes behind one interface — *per-user pull* (full
content, for investigations/DSARs/mid-size matters) and *tenant-scale Purview
estimate* (for large document matters). Real Graph when a tenant is connected;
representative mock otherwise.

### Processing (making data reviewable)

| Source | Change |
|---|---|
| **CW-1** | `text-extract.ts` — `htmlToText` + `extractAttachmentText`, best-effort, wrapped so any failure keeps the filename. This is the "processing" layer that turns raw bytes into review text. |
| (earlier, RC-series) | Email **threading**, **near-duplicate** detection, and **family** grouping (parent email + attachments) stamp `threadId` / `dedupKey` / `familyId` / `isInclusive` on every item at persist time (`assignThreadingAndDedup`). |
| (earlier, RC-5) | **Persisted cull** — thread/near-dup suppression writes `excludedAt` + `exclusionReason` (a defensible exclusion log), reversible. |

**Net:** collected items are deduped, threaded, and family-grouped on ingest;
culling is a first-class, logged, reversible step. (Concept clustering — ECA-2
— is still open.)

### Review / AI review (deciding what matters)

| PR | Change |
|---|---|
| (earlier, AIR-1/3) | The shared **`@aegis/ai-review`** engine tags each doc across **5 dimensions** (responsive / privileged / PII / key-document / redact), each with **confidence + citation**, and **routes** it (auto-cull / reviewer / attorney). Runs the deterministic screen today; Claude wired behind the same interface. |
| **AIR-2** | **Versioned review profiles** — reusable review instructions (criteria + issue codes + prompt-template override + thresholds). Every edit freezes an immutable `ReviewProfileVersion`, so "which instructions did the AI run under, on this date" is answerable. Plus **✨ Draft with AI** — a deterministic drafter that turns a matter description into criteria + issue codes to edit. |
| **AIR-4** | **Pilot → validate → scale.** Stratified-sample the AI-scored docs, code the sample (ground truth), compute **recall / precision (with 95% Wilson CIs) / F1 / overturn** + confusion matrix, then **apply-at-scale**: accept the AI's *confident, cited* calls on the rest and **fail closed** (leave pending for a human) on uncited-high-confidence, low-confidence, and privileged docs. Human-triggered; chain-sealed. |
| **INV-1** | **Investigations** — a source letter is run through the deterministic drafter to extract issue codes + a draft plan (steps, custodian hints, scope), then opens a Matter of type INVESTIGATION; collection reuses the `INVESTIGATION` review-set origin. |

**Net:** review instructions are a versioned, auditable asset; the AI's
accuracy is *measured against humans* before it's trusted; and applying it at
scale fails closed. The Claude model itself is wired but defaults to the
deterministic engine (the governance posture) — that's the seam the capstone
turns on for read-only chat.

---

## Part 2 — Forward plan

### ECA-3 — Early Case Assessment dashboard  *(next; no migration)*

"How big is this and what's it about, before we pay to review it." A read-only
aggregation over the existing `ReviewSetItem` data — **no schema change**.

- **Volume funnel**: Collected → after-dedup → after-threading (inclusive only)
  → culled/excluded → in-scope (AI-responsive or coded-responsive).
- **Cost & time estimate**: in-scope docs × configurable per-doc review rate +
  hours, with a "what culling saved you" delta.
- **Composition**: by source system, by AI route, by issue code, top custodians.
- **Freeze scope**: a one-click summary of what a review of the in-scope set
  would cover, exportable.
- New `getEcaFunnel(reviewSetId)` service + `GET /api/review/sets/[id]/eca`;
  new **ECA** stage (first in the workspace stepper) + `EcaPanel`.

### Investigations spine (after ECA-3)

- **INV-2** — wire **hold + custodian-scoped collection directly from an
  investigation**: from the investigation, issue a legal hold on the suggested
  custodians and kick a collection into an `INVESTIGATION` review set — one
  click from allegation to preserved-and-collected. (No migration.)
- **INV-3** 🟥 — **issue-coded review + chronology builder**: as docs are coded
  against the investigation's issues, facts assemble into a chronology
  (date → fact → source doc), the backbone of the findings report. (Migration:
  a `CaseFact` / chronology table.)
- **INV-4** — **findings report** (theory + chronology + key docs + gaps,
  produced document) + a **real-tenant investigation seeder** (like Priya's
  DSAR seeder) so the flagship demo runs on real mail.

### Capstone — Case Graph (the "beyond incumbents" layer)

The differentiator: not just *review* the documents, but **reason over the
whole case** with a Claude-native copilot and an **agent graph** that produces
case results — every agent action governed and chain-sealed. Four phases:

- **CAP-1 — Case Copilot (Claude chat over the collection).** A chat panel in
  the review workspace. Retrieval-augmented: the copilot answers questions
  ("what did the VP say about the source code?", "summarize the privilege
  disputes", "who are the key players?") grounded in the **coded + collected
  documents**, and **every answer cites the documents** it used (click through
  to the item). Read-only — it *suggests* actions (tag these 12 as privileged,
  add this custodian) but executes nothing on its own. Live Claude via the
  `@aegis/ai` proxy when `ANTHROPIC_API_KEY` is set; degrades to a
  deterministic keyword-retrieval answer otherwise. This is the "advanced
  Claude chat interface" — the seam where live Claude legitimately turns on,
  because a cited, read-only answer changes no state.

- **CAP-2 — Agent Graph → Case Dossier.** A **graph of specialized agents**
  (not one prompt) that runs over the collection and emits a structured **Case
  Dossier**. The DAG:

  ```
  Retrieve ─┬─▶ Issue-Cluster ─┐
            ├─▶ Timeline-Build ─┼─▶ Theory-Synthesize ─▶ Gap-Critic ─▶ Dossier
            └─▶ Entity-Extract ─┘
  ```

  Each node is an agent with a scoped prompt over a slice of the case; the
  orchestrator is a deterministic graph runner (same shape as the existing
  workflow engine) so the topology is inspectable and every node's output is
  recorded. Output: **case theory, key documents (with citations), chronology,
  open questions / gaps, recommended next steps**. Runs deterministically end-
  to-end (each agent has a deterministic fallback), Claude-backed per node when
  configured. This is the "agent graph that gives case results."

- **CAP-3 — Case Knowledge Graph.** An interactive graph the CAP-2 agents
  populate: **nodes** = people, organizations, custodians, documents, facts,
  events; **edges** = communicated-with, custodian-of, authored, contradicts,
  supports, occurred-on. Rendered as a pan/zoom graph (Canvas) in the
  workspace — click a person to see their documents and facts, follow a
  contradiction edge between two documents. This is the "open, agentic graph"
  view of the case: the agents build the graph, the lawyer explores it. Backed
  by a `CaseEntity` / `CaseEdge` schema (migration) so it persists and audits.

- **CAP-4 — Governed agentic actions.** The copilot and agents can *act* — but
  only through the existing governance harness. Every proposed action (bulk-tag
  a cluster, draft a finding, escalate a custodian, add to the chronology)
  writes a **PENDING `AgentDecision`** row; the reviewer's approve keystroke is
  the only path to execution; on approval the action runs and chain-seals with
  the `AgentDecision` id on the resulting audit row. This is where "agents act
  on data" lands **without** violating conservative governance — the agent
  proposes, the human approves, the chain records both. (This also finally
  exercises the `AgentDecision` contract on the review side.)

**Why this beats incumbents:** Relativity aiR / Everlaw give you a review
copilot and analytics. AEGIS gives you a **governed agent graph that assembles
the case** — theory, chronology, knowledge graph, and next actions — with
every AI step measured (AIR-4), cited (CAP-1), and gated + chain-sealed
(CAP-4). It's not a smarter tagger; it's a case-reasoning system a GC can put
in front of a court because every inference is sourced and every action is
approved and sealed.

### Build order

1. **ECA-3** (now)
2. **INV-2** → **INV-3** 🟥 → **INV-4** (finish the investigations spine)
3. **CAP-1** → **CAP-2** → **CAP-3** 🟥 → **CAP-4** (the Case Graph capstone)

Migration (🟥) PRs pause for a Neon `prisma migrate deploy` before merge, same
cadence as before. The demo stays working end-to-end at every checkpoint.
