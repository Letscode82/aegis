# @aegis/workflow

**Status: STUB.** Empty in Step 1. This README is an architectural commitment
— it locks in *where* workflow primitives live so future work cannot invent
parallel alternatives.

## What this package will do
A single, shared engine for the multi-step, multi-actor processes that recur
across modules: intake triage, contract approval chains, DSAR fulfillment,
incident response runbooks, board-pack assembly. Each module defines
*workflow definitions* (typed step graphs); this package owns *workflow
execution* — instances, state transitions, due dates, escalations,
notifications, audit trail.

Without a shared engine, each module would invent its own approval-chain
state machine, and "approve in Intake" would not be auditable the same way
as "approve in Spend." That breaks both Differentiator #1 (one brain) and
Differentiator #3 (conservative AI governance with full audit trail).

## When it will be implemented
**Phase: post-Step 6.** First needed when a second module wants the same
approval-chain mechanics (e.g. Step 6 introduces invoice approval and we
realize Intake's recommendation-approval flow can share the engine). Until
two modules need it, it stays a stub.

## Public API surface (planned)

```ts
import {
  defineWorkflow,
  startWorkflow,
  advanceStep,
  cancelWorkflow,
  getWorkflowInstance,
  listInstancesForResource,
} from "@aegis/workflow";

defineWorkflow({
  id: "contract.approval.standard",
  steps: [
    { id: "legal_review",    actor: "role:attorney" },
    { id: "finance_review",  actor: "role:finance",   when: ctx => ctx.amount > 50_000 },
    { id: "gc_signoff",      actor: "role:gc",        when: ctx => ctx.risk === "high" },
  ],
  onComplete: ctx => contractsApi.markApproved(ctx.contractId),
});
```

The engine handles: step ordering, conditional steps, timeouts/escalations,
parallel branches, recall/cancel, restart-on-edit, and a single `WorkflowEvent`
stream that feeds `AuditLog`.

## Entities owned/managed
- `WorkflowDefinition` (in code, registered at startup)
- `WorkflowInstance` (in `@aegis/db`) — id, definitionId, resourceType,
  resourceId, status, startedAt, completedAt, currentStepId
- `WorkflowStepInstance` — id, workflowInstanceId, stepId, actor, status,
  startedAt, completedAt, decision
- `WorkflowEvent` — append-only log mirroring shared `Event` entity

## Why a shared service vs. a module
- Workflows cross module boundaries (a contract approval may pull in Spend
  for budget check, Privacy for DPIA, Governance for policy attestation).
- The execution engine is purely infrastructure — no UI, no domain logic.
- Auditability requires a single ledger of state transitions, not one per
  module.

## Out of scope
- Visual workflow builder UI (that's a feature of the **Governance** module).
- Routing rules engine (lives inside the relevant module's triage logic).
