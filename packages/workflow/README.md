# @aegis/workflow

**Status: ACTIVE (W-A shipped).** The approval-ladder engine adopted via
[`docs/workflow-engine-assessment.md`](../../docs/workflow-engine-assessment.md).
The stub's activation condition ("until two modules need it") was met by
owner decision in July 2026: intake dynamic workflows + CLM ladders are
the two consumers.

## What this package does

A single, shared engine for the multi-step, multi-actor governance
ladders that recur across modules: intake triage chains, contract
approval ladders, DSAR fulfillment, incident-response runbooks. Ladder
*definitions* are data (up to 15 ordered steps); this package owns
*execution* — instances, transitions, skip conditions, SLA aging,
optimistic locking, and the audit twin.

## Semantics

| Action | Behaviour |
|---|---|
| `approve` | Moves to the next non-skipped step; approving the last step completes the workflow |
| `reject` | Resets the instance to the first non-skipped step |
| `send_back` | Moves to **any previous step** the actor selects |
| `cancel` | Terminates the workflow (audit-logged) |

Plus:
- **Skip conditions** — a step may declare
  `metadataJson: {"skip_if": {"field","op","value"}}` evaluated against
  the instance's `contextJson` (e.g. skip Finance Review when
  `contract_value < 10000`). A malformed rule never blocks a workflow.
- **SLA aging** — a step with `slaHours` turns the RAG strip's Amber to
  Red once the instance has been waiting on it longer than the SLA.
- **Optimistic lock** — callers pass `expectedVersion`; two approvers
  acting at the same moment can't both succeed
  (`WorkflowVersionConflictError`).
- **Agent steps** — `kind: AGENT` steps queue a `WorkflowAgentTask` on
  arrival. This package does NOT run agents; the host module's runner
  (W-B) executes the agent and applies the decision back through
  `actOnWorkflow`, gated by the `AgentDecision` contract. Humans can
  always act on an agent step directly.

## Governance

Every movement writes a `WorkflowTransition` row (product surface) AND
a chain-sealed `AuditLog` row via `@aegis/db.logAudit`
(`workflow.instance.*` actions), linked via
`WorkflowTransition.resultingAuditLogId` — the twin-recording pattern
from the Architectural Foundations. Agent actors (`"agent:<key>"`)
land as `actorType: AGENT`.

## Public API

```ts
import {
  defineWorkflow,      // upsert a ladder template (org, key) — max 15 steps
  startWorkflow,       // attach an instance to any host entity
  actOnWorkflow,       // approve / reject / send_back / cancel
  getWorkflowInstance, // instance + steps + transitions + RAG strip
  listInstancesForEntity,
  computeRag,          // pure — Red/Amber/Green per step
  shouldSkip, nextActionable, // pure rule helpers
  WorkflowError, WorkflowVersionConflictError,
} from "@aegis/workflow";
```

Entities (in `@aegis/db`): `WorkflowDefinition`, `WorkflowStep`,
`WorkflowInstance`, `WorkflowTransition`, `WorkflowAgentTask`.
Instances attach polymorphically via `entityType` + `entityId`
(`"intake_ticket"`, `"contract"`, …).

## Tests

- `pnpm --filter @aegis/workflow test` — pure rules (no DB).
- `pnpm --filter @aegis/workflow run test:db` — engine integration
  suite; runs in CI's `db-integrity` job against migrated Postgres.

## Roadmap (per the assessment)

- **W-B** — HTTP routes + RBAC gating + agent-step runner through
  `AgentDecision`.
- **W-C** — intake integration (`IntakeRequestType.workflowKey`,
  instance per ticket, Cockpit RAG strip, approve = stage advance).
- **W-D** — Aurora wizard / builder UI + the 10-ladder governance
  library as seed data.

## Out of scope
- Domain logic and module UI (modules own their screens; the wizard
  resolves `screenKey` through the host's screen registry).
- Routing rules (they live in intake's Smart Routing).
