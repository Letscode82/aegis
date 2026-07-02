# Intake Track 1 — Demo UI backlog

Phase 1 (PRs #84–#89) shipped six intake capabilities as **schema +
services + API + tests**, but most have **no UI yet**. Track 1 surfaces
them so the DRL pilot is demoable end-to-end. Each activity wires an
existing, tested API into the intake SPA
(`modules/intake/src/intake/index.jsx`) or a new admin page — no new
backend, no new migrations.

Ordered by demo ROI. One activity per PR; the demo must keep working at
every checkpoint. Local quality gate per item: `pnpm build` (typecheck)
+ `pnpm --filter @aegis/intake test` green. **Merge/CI requires the
GitHub connection to be re-authorized** — until then each item lands on
a branch and is queued for PR.

- [ ] **1. Teams / pools admin surface.** A "Teams" view under Smart
  Routing: list pools, create/edit (name, key, strategy
  least_loaded|round_robin, overflow team, sortOrder), add/remove
  members with capacity + active toggle. Wired to
  `/api/admin/intake/teams/*` (item 5).

- [ ] **2. Route-to-pool action in the routing-rule editor.** Add the
  `setTeamId` action (pool dropdown) to the routing-rule editor, and
  render "pool → member (overflow?)" on each ticket's fired-rule
  summary. Wired to the existing rule API (`setTeamId` already
  supported) (item 5).

- [ ] **3. Hand-off control on the Triage Cockpit.** Per-ticket
  "Hand off" control (to human [assignee picker] / back to agent / to
  queue) with a reason, a current-holder badge, and the baton-pass
  history. Wired to `/api/intake/tickets/[id]/handoff` (item 6).

- [ ] **4. Ticket work panel — assignments + tasks + workStatus.**
  Delivery layer on the ticket detail: assignees with roles, sub-tasks
  with status, a workStatus selector. Wired to
  `/api/intake/tickets/[id]/{delivery,assignments,tasks,work-status}`
  (items 1–2).

- [ ] **5. Parties / people-involved panel.** On the ticket detail,
  list parties (Person/Counterparty + role), add/remove. Wired to
  `/api/intake/tickets/[id]/parties` (item 3).

- [ ] **6. Litigation tracking view.** A focused view for litigation
  tickets composing parties (adverse party / counsel), current status,
  assignments, and the response deadline the Litigation agent
  extracted (items 2 + 3 + 4).

- [ ] **7. Request-type surfaces.** Request-type picker on New Request
  (drives which fields show) + a small admin list for request types.
  Wired to `/api/admin/intake/request-types/*` + ticket create (item 1).

## Not in Track 1 (later)
- Track B hardening: blob storage + presigned upload (removes the 3 MB
  upload cap), pdf.js swap for robust PDF extraction, rate-limiting,
  monitoring, P4b productionization.
- Track C DRL workshop config: tier/competency matrix (as IntakeTeam
  config), per-leg SLAs, per-workstream request-type field sets. See
  `docs/Enhancements-to-Intake-DRL.md`.
