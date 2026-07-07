# Workflow Engine — Embedding Assessment (intake / CLM / GC Suite)

> Assessment of the uploaded `workflow-engine` package ("Legal Front
> Door — Governance Workflow Engine for the GC Office") against the
> AEGIS architecture. Verdict up front: **the design is an excellent
> fit and should be adopted — by porting it into `packages/workflow`,
> not by mounting the Python service alongside AEGIS.**

## 1 · What the package is

A deliberately small (~2,100 lines) Camunda-style approval-ladder
engine:

- **Backend** — Python FastAPI + SQLAlchemy, 5-table Postgres schema:
  `workflow_definitions` → ordered `workflow_steps` (≤15, enforced by
  trigger) → `workflow_instances` (attached to any host entity via
  `entity_type` + `entity_id`) → `workflow_transitions` (immutable
  audit trail) + `workflow_notifications` (outbox) + `agent_tasks`
  (agent-step work queue).
- **Semantics** — approve → next step; reject → back to step 1;
  send-back → any previous step; cancel. Plus three sharp extras:
  **skip conditions** (tiny JSON rule language over instance context,
  e.g. skip Finance Review under ₹10k), **SLA aging** (Amber→Red per
  step via `sla_hours` + `step_entered_at`), and an **optimistic
  version lock** (two approvers can't both act).
- **Agent steps** — `kind: agent` steps queue a task; a registered
  handler returns `{action, comment, confidence}`; **below
  `min_confidence` the decision is NOT applied** — the task escalates
  to the step's human `approver_role`. Humans can always act on an
  agent step directly.
- **Frontend** — Next.js components: `WorkflowWizard` (step UI with
  per-step screen mapping via `screenRegistry`), `RagProgress`
  (Red/Amber/Green ladder strip), `WorkflowBuilder` (admin authoring).
- **The library** — 10 seeded governance ladders grounded in a pharma
  GC office: NDA fast-track, contract approval, ANDA/Para-IV patent
  litigation (Hatch-Waxman 45-day window), legal notice response,
  regulatory action (USFDA/NPPA), vendor due diligence, compliance
  investigation (UCPMP), DPDP data-breach (72-hour clock),
  employment/POSH, board approvals — **directly relevant to the DRL
  GCC pilot.**

## 2 · Can it be embedded? Yes — but port, don't mount

The *concepts* drop cleanly onto AEGIS. Mounting the package as-is (a
second Python service with its own DB access, auth, audit, and
notifications) would violate four CLAUDE.md non-negotiables:

| Package as-is | AEGIS non-negotiable | Resolution in the port |
|---|---|---|
| SQLAlchemy connects to Postgres directly | All data access through `@aegis/db`; no raw SQL outside `packages/db` | Prisma models for the 5 tables; engine in TypeScript |
| Own `workflow_transitions` audit trail (plain table) | Every mutation writes the **chain-sealed** `AuditLog` | Twin-record: transition row (product surface) + `logAudit()` (compliance ledger) — the exact `recordMatterEvent` pattern |
| Own `auth.py` + free-text `approver_role` | `@aegis/auth` RBAC, `canUserDo()` on every mutation | `approver_role` maps to the existing 8 roles / `Permission` enum; `assertUserCanDo` on every action endpoint |
| Own notification outbox + email placeholders | W3-2 outbound notifications already exist | Engine calls the existing notification service; outbox table dropped |
| Agent handlers with own registry + confidence gate | 11 registered agents + **schema-enforced `AgentDecision` gate** | Agent steps call the existing agents; the decision lands as a PENDING `AgentDecision`; the Cockpit approve keystroke applies it. The package's `min_confidence` escalation is the same philosophy — ours is stronger (schema-enforced), so the port *keeps our gate* |

This mirrors the Python-FastAPI assessment already given for agents:
**the governance/data plane stays TypeScript.** The package's own
README markets the engine as "plain data for the same lightweight
engine" — the value is the schema shape, the ladder semantics, the
skip-rule language, the RAG computation, and the 10-ladder library.
All of that ports 1:1; `engine.py` is 197 lines.

## 3 · What it adds that AEGIS doesn't have

AEGIS today has *linear* stage lists (`IntakeRequestType.stagesJson`,
matter state machine) and single-leg + multi-leg SLA clocks. The
engine adds the missing workflow dimension legal actually needs:

1. **Reject-to-start and send-back-to-any-step** — real governance
   ladders are not linear; a GC sending a contract back to Finance
   without restarting legal review is the daily reality.
2. **Skip conditions** — value-banded ladders (skip Finance < ₹10k,
   skip antitrust review when no settlement proposed) without
   per-type code.
3. **Per-step SLA aging with RAG** — the Amber→Red strip per step, on
   top of our existing whole-ticket multi-leg SLA.
4. **Agent steps inside human ladders** — a ladder step that runs one
   of our 11 agents and escalates to the human role below confidence:
   the doc's "agents coordinate through the ontology" made concrete
   in workflow form.
5. **The 10-ladder pharma library** — seeded, DRL-relevant
   `IntakeRequestType`-grade content (Para-IV windows, DPDP 72-hour
   clock, UCPMP investigations) that makes the Request Types admin
   instantly credible in a pharma demo.
6. **Optimistic locking** on approvals — we don't have double-approval
   protection on intake stage advancement today.

## 4 · Where it lands

- **`packages/workflow`** — currently a stub whose locked scope is
  exactly this ("Workflow definitions + execution engine"). The
  engine, skip rules, RAG computation, and optimistic lock go here.
  No module-isolation exception needed — this is shared
  infrastructure by design.
- **`@aegis/db`** — 5 Prisma models (`WorkflowDefinition`,
  `WorkflowStep`, `WorkflowInstance`, `WorkflowTransition`,
  `WorkflowAgentTask`), additive migration. `entity_type`/`entity_id`
  polymorphic attachment matches our existing polymorphic patterns
  (`Document`, `Tagging`).
- **Intake integration** — `IntakeRequestType` gains an optional
  `workflowKey`; ticket creation starts an instance; the Cockpit
  ticket view renders the RAG ladder strip; approve on the current
  step is the stage-advance path (`intake.ticket.stage_advanced`
  audit already exists from P2b).
- **CLM / future modules** — the same engine attaches to contracts
  (`entity_type: "contract"`) when the Contracts module ships; the
  matter module can adopt ladders for closeout checklists later.
  One engine, many ladders — no per-module workflow code.
- **UI** — `WorkflowWizard` / `RagProgress` / `WorkflowBuilder`
  re-implemented as Aurora components (the package's components are
  App-Router + its own styling; AEGIS is Pages-Router + Aurora
  tokens). `screenRegistry` becomes a mapping from `screen_key` to
  existing intake panels.

## 5 · Effort estimate

| Slice (one PR each, demo green at every checkpoint) | Est. |
|---|---|
| W-A: Prisma schema + TS engine port (state machine, skip rules, RAG, version lock) + twin-recorded audit + unit tests | 3 days |
| W-B: API routes + RBAC gating + agent-step wiring through `AgentDecision` | 2 days |
| W-C: Intake integration (workflowKey on request types, instance per ticket, Cockpit RAG strip, approve = advance) | 2 days |
| W-D: Aurora wizard + builder UI + library seeding (10 ladders as seed data) | 3 days |
| Total | **~10 engineer-days** |

Risk: low. The engine is small, deterministic, and fully unit-testable;
nothing touches existing flows until W-C wires the first request type.

## 6 · What we deliberately do NOT port

- The Python service, its auth, its notification outbox, its
  triage/intake router (`POST /api/workflows/intake` duplicates our
  classifier + routing rules — ours stay authoritative).
- The package's own audit trail as the compliance record — ours is
  chain-sealed; theirs becomes the product-surface twin.
- The 15-step trigger as the only guard — we add the same limit in
  the service layer where it's testable.
