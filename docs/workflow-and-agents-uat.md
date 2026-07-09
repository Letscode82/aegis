# AEGIS — Workflow & Agents test guide (hands-on UAT)

> Practical, click-by-click tests for the two things that make AEGIS
> AEGIS: the **11 agents** and the **governance-workflow program**
> (Designer, versioning, SLA "where it's stopped", role views,
> agent-per-type binding, Agents console, Focus mode).
>
> - Agent-by-agent recipes (what to file, what to expect) live in
>   [`agent-testing-guide.md`](./agent-testing-guide.md) + the sample
>   documents in [`agent-test-fixtures/`](./agent-test-fixtures/).
> - This doc adds the **workflow** tests and a combined end-to-end run.
>
> **Before you start:** hard-refresh the demo (Cmd/Ctrl + Shift + R) so
> today's work loads. Sign in as admin (default). Use **↻ Reset Demo**
> if you want a clean slate.

---

## Part A — Agents (11 tests)

Full recipes are in `agent-testing-guide.md`. The one-line version —
file each from **New Request**, then open the ticket in **Triage
Cockpit** and read the right-hand **Agent Recommendation** panel:

| # | Agent | File this | Pass = |
|---|---|---|---|
| 1 | NDA | attach `nda-deviation-mutual-cda.txt` (type NDA Request) | flags perpetual-confidentiality + India-vs-Delaware deviations |
| 2 | Vendor | `Vendor: Globex Corp in Germany, new supplier onboarding` (Vendor Due Diligence) | sanctions screen in concerns; hit → escalate |
| 3 | Trademark | `Trademark clearance for "Zephyrion" in US and EU` | "not a registry search" risks |
| 4 | Contract Review | attach `contract-msa-uncapped.txt` (Contract Review) | uncapped liability → REJECT band |
| 5 | FAQ | `What is our data retention period for customer data?` | KB answer + "general guidance" line |
| 6 | Policy Q&A | `What does our travel policy say about business class?` | policy citation |
| 7 | Privacy | `Launching a wellness portal storing employee health records` | HIGH → escalate + gaps list |
| 8 | Marketing | `Ad copy: our device prevents infections, FDA-approved` | regulated claim → never agent-cleared |
| 9 | Notice | attach `breach-notice.txt` | cited deadline + SLA tightened + escalate |
| 10 | Litigation | `We received a demand letter from Meridian Corp regarding the supply contract` | cited case brief + hold-trigger flag |
| 11 | Contract Specialist | attach `licensing-exclusive.txt` (Contract Review) | names Licensing playbook; exclusive → escalate |

**Governance check (do once):** approve one ticket with `A`, reject one
with `X`, then open **Audit Log** (`/audit-log`) → **Verify** — every
action is in the chain-sealed ledger and verification passes.

**Agent console check:** left nav → **Agents** tab → each agent shows
its playbook, risks, the request types it handles, and 7-day metrics.
Toggle one off, file a ticket of its type → it no longer picks up.

---

## Part B — Workflow program (7 tests)

### B1 · Workflow Designer — build a workflow
1. Left nav → **Workflow Designer** → **Seed 10-ladder library** (if
   empty) → you get 10 ladders.
2. **+ New workflow** → Name `Test NDA Ladder`.
3. Add steps: **+ Human step** (name "Request", role `requester`),
   **+ Agent step ⚙** (pick **NDA** agent, escalate-below-confidence
   0.75), **+ Legal Review** preset, **+ GC Approval** preset.
4. Reorder with ↑↓; set SLA hours on Legal Review (e.g. 48).
5. **Create workflow.** → **Pass:** it appears in the list as
   `test_nda_ladder · v1 · 4 steps` with step chips.

### B2 · Version history + revert
1. Open **Test NDA Ladder** → **Edit** → delete the GC Approval step →
   **Save changes.** Card now reads `v2 · 3 steps`.
2. Edit again → expand **Version history (2)** → click **Revert** on
   **v1**. → **Pass:** toast "Reverted to v1 (saved as v3)", the GC
   step is back, card reads `v3`. History is never rewritten.

### B3 · Bind the workflow to a request type
1. Left nav → **Request Types** → **+ New type** → Name `NDA`,
   **Workflow ladder key** → pick `test_nda_ladder` (or the seeded
   `nda_fasttrack`), **Handled by agent** → NDA agent. Create.
2. **Pass:** the type card shows `handled by NDA · bound` and, if you
   bound a ladder, tickets of this type will run it.

### B4 · Run a ticket through the ladder
1. **New Request** → type **NDA** → describe `Mutual NDA with Acme` →
   submit.
2. **Triage Cockpit** → open the ticket → the **Governance ladder**
   card shows RAG dots, the current step, and **Approve step / Send
   back / Reject** buttons.
3. Click **Approve step** a few times → the dots turn green and the
   current-step marker advances. Try **Send back to…** a previous step
   → that step turns red until re-approved. → **Pass:** the ladder
   advances/rewinds and each action is audited.
4. (Any ticket with no ladder shows a **"Put this ticket on a ladder…"**
   picker — pick one, Start, and the ladder appears.)

### B5 · SLA "where it's stopped"
1. Left nav → **SLA Dashboard** → scroll to **Governance workflow SLA**.
2. **Pass:** you see the in-flight ticket(s) with the step they're
   **stopped on**, hours vs SLA (breached in red), and an **avg time
   pending per stage** chart (human amber / agent purple). Ladders
   with tight SLAs (e.g. `data_breach`, 4h) go red as time passes.

### B6 · Role-based views (each team's view)
1. Top bar → **👁 View as role** → pick **Samira · paralegal**.
2. **Pass:** the admin tabs (Teams / Request Types / Workflow Designer
   / Agents) disappear; **My Work** shows that user's queue; on a
   ticket whose current ladder step is assigned to `attorney`, the
   Approve button is refused for a paralegal (per-step RBAC).
3. Switch to **Marcus · gc**, then **Reset to default (admin)**.

### B7 · Focus mode (declutter)
1. In **Triage Cockpit**, click **⊞ Focus** (top-right).
2. **Pass:** the secondary panels collapse — triage/routing/stages
   behind "▸ Triage · routing · stages", and similar-matters / work /
   parties / capacity behind "▸ More context" — leaving the request +
   the agent recommendation dominant. Click **⊟ Focus on** to toggle
   back; the preference sticks across reloads.

---

## Part C · Combined end-to-end ("the NDA journey")

The demo spine in one pass:

1. **Designer:** confirm `nda_fasttrack` exists (or build B1).
2. **Request Types:** an "NDA" type bound to that ladder + NDA agent.
3. **New Request:** file an NDA (attach `nda-deviation-mutual-cda.txt`).
4. **Cockpit:** the NDA agent flags the deviations (Part A #1) **and**
   the governance ladder starts (B4). Approve the agent recommendation
   with `A`; advance the ladder step.
5. **SLA Dashboard:** the ticket appears under Governance workflow SLA
   at its current step (B5).
6. **View as role:** switch to the attorney to see the Legal Review
   step is theirs to action (B6).
7. **Audit Log → Verify:** every step is on the chain (governance).

If all seven land, the platform's core loop — **agent triages → human
governs → workflow tracks → audit proves** — is demonstrably working.

---

## What "pass" tells you

- **Agents** produce the right recommendation + deliverable for each
  request class, and never act without a human (conservative AI
  governance).
- **Workflows** are admin-buildable (steps + people + agents),
  versioned, role-scoped, and their SLA state is visible per step.
- **The chain-sealed audit log** proves every agent decision, approval,
  and ladder movement — the differentiator no point tool has.

Log anything that doesn't match into the tracker
(`uat-intake-e2e-tracker.csv`) and send it over — I'll fix per the
per-PR loop.
