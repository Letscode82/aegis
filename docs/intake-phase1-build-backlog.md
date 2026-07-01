# Intake Phase 1 — Build Backlog (workshop-independent mechanism)

The high-effort build elements that are **independent of the discovery
workshop** — the *mechanism*, not the client-specific config (DRL's exact
tier matrix, SLA definitions, request-type fields, and integrations are
config filled in later). Built one item per PR, **tests + CI green before
merge**, each item checked off here when merged.

Execution: driven by the `/loop` skill (self-paced), one item per
iteration, in dependency order.

## Rules for each item
- One feature branch + PR per item (schema migration if needed, services,
  API, tests). Additive migrations only; never break the audit chain.
- Run the intake/matter vitest suites locally before pushing.
- Wait for CI (`ci` + `db-integrity`) green, then squash-merge, then sync
  `main` and check the item off here.
- **After each merge, append a one-line note to
  `docs/intake-phase1-progress.md`** — `| <date -u UTC> | <item> | #<PR> |
  merged |` — so the run has a durable audit trail without opening GitHub.
- Follow CLAUDE.md: all DB via `@aegis/db`, module isolation, audit every
  mutation, conservative-AI (human approval gate) intact.

## Backlog (in order)

- [x] **1. Request-type framework.** `IntakeRequestType` (org, key, name,
  workstream, active) + per-type structured fields (`IntakeRequestField`:
  label, kind, required, order) + a stage list. Services + admin CRUD API.
  Ticket carries `requestTypeId` + `fieldValuesJson`. Audit on create/edit.
  *(Container for every workstream; DRL's actual fields are config later.)*

- [x] **2. Work-tracking / assignment + status layer.** Multiple
  assignments per ticket with a role (`IntakeTicketAssignment`:
  ticketId, userId, role, assignedAt) + optional sub-tasks
  (`IntakeTicketTask`: title, assigneeUserId, status) + a work-status
  lifecycle beyond request status. This is the "who is assigned what /
  current status / how delivery is happening" layer. Services + API +
  audit.

- [x] **3. Parties / people-involved tracking.** Link the shared `Person`
  / `Counterparty` entities to a ticket as parties with a role
  (`IntakeTicketParty`: ticketId, personId?/counterpartyId?, role e.g.
  adverse-party / involved-counsel / witness / requester). Services + API
  + audit. Reuses shared entities (no new party tables).

- [x] **4. Litigation intake (tracking only — NO legal hold).** A
  litigation request type (via #1) + a Litigation intake agent that
  extracts adverse party + parties involved (→ #3), current status,
  assignments suggestion (→ #2), jurisdiction, and any response deadline.
  Explicitly **does not** trigger a legal hold in this phase. Human
  approval gate intact.

- [x] **5. Tiering layer on Smart Routing.** A team/pool concept
  (`IntakeTeam` + members) + a route-to-pool action on the existing
  routing rules + load-balancing within a pool (least-loaded /
  round-robin) + overflow-on-capacity to another pool/senior. Extends the
  built Smart Routing engine; DRL's tier matrix is config on top.

- [x] **6. Agent ↔ human hand-off model.** Explicit, audited baton-pass
  states + a hand-off action (agent → human review → back to agent, or
  reassign across tiers), with the ticket never leaving the platform.
  Builds on the existing AgentDecision + triage states.

## Deferred to post-workshop (do NOT build yet)
- Exact DRL tier/competency matrix, SLA definitions per leg, request-type
  field sets, multi-leg SLA clocks tuned to their process.
- Any tool integrations (CLM/DMS/ITSM/e-sign) — sized after discovery.
- Auth0 SSO federation to their IdP, observability provider choice,
  data-residency config.
