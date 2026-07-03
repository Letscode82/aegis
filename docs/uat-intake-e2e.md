# AEGIS Intake — End-to-End UAT Plan

**Scope:** every shipped feature of the Intake module (Waves 1–4 of
`docs/intake-worldclass-backlog.md` plus the pre-wave foundation:
channels, agents, routing, tiering, hand-offs, tracking, audit).
**Audience:** UAT testers signing the module off for the client pilot.
**How to use:** work suite by suite; each case has steps, expected
results, and a result line. Suites are independent unless a case says
otherwise, but Suite 0 (setup) is required first. Log failures in the
Defect Log (§18) with the case ID.

Version: 1.0 · Covers code as of 2026-07-03 (post PR #147)

---

## 0 · Environment & prerequisites

### 0.1 Environments

| Item | Value |
|---|---|
| UAT URL | `https://<your-production-domain>` (Vercel production) |
| Database | Neon Postgres (prod), migrated + seeded |
| Auth | Auth0 (production) — testers need Auth0 accounts whose **email matches a seeded/JIT-provisioned User** |
| Local fallback | `pnpm dev` on `:5173` with no `AUTH0_*` env → runs as the seeded admin; personas via `DEV_USER_EMAIL=<email>` in `.env.local` |

### 0.2 Feature-flag / config matrix

Some features are **config-activated**. Test what is configured; cases
note their dependency. Each row is verifiable before you start.

| Config | Enables | How to verify it's on |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude-powered triage + agent drafts | AI Triage panel shows `CLAUDE LLM`; without it, `REGEX CLASSIFIER` / deterministic templates (both are valid — cases note which) |
| Vercel Blob store (`BLOB_READ_WRITE_TOKEN`) | 25 MB direct uploads, original bytes retained | New Request upload hint reads "Max 25 MB · original file retained" |
| `AEGIS_EMAIL_WEBHOOK_SECRET` | Email-channel auth (fail-closed in prod) | `curl` without the secret → HTTP 401/503 |
| `AEGIS_TEAMS_WEBHOOK_SECRET` | Teams-channel HMAC auth (fail-closed in prod) | `curl` without a signature → HTTP 401/503 |
| Intake mailbox (Admin → M365 + mailbox row) | Real notification **delivery** (otherwise recorded-only) | Suite 12 cases note both outcomes |
| `AUTH0_ENTERPRISE_CONNECTION` + `AEGIS_SSO_AUTO_PROVISION_DOMAINS` | Entra SSO + JIT provisioning | Suite 15 |
| `AEGIS_SLOW_REQUEST_MS` / `AEGIS_SLOW_QUERY_MS` | Observability thresholds (defaults 2000/500 ms) | Suite 14 |

### 0.3 Test personas (seeded)

Sign in as each persona via its Auth0 account (prod) or
`DEV_USER_EMAIL` (local). All emails end `@aegis-demo.example`.

| Persona | Email (local-part) | Role | Used in |
|---|---|---|---|
| **Alex Nguyen** | `alex.nguyen` (or `SEED_ADMIN_EMAIL`) | admin | admin suites, approvals |
| **Marcus Reyes** | `marcus.gc` | gc | escalation target, approval gate |
| **Lena Pérez** | `lena.attorney` | attorney | cockpit triage, assignment |
| **Samira Iqbal** | `samira.paralegal` | paralegal | pool member, tasks/effort |
| **Thomas Berger** | `thomas.legalops` | legal_ops | Pool Ops, SLA dashboard |
| **Alex Kim** | `alexkim.requester` | requester | requester journey |
| **Felix Brennan** | `felix.viewer` | viewer | read-only checks |

### 0.4 Data conventions & reset

- Prefix every ticket description you create with **`UAT:`** so test
  data is identifiable.
- **↻ Reset Demo** (header button, staff view) wipes tickets /
  conversations / cockpit state and re-seeds the demo fixtures. Use
  between suites if state gets tangled. It does **not** touch routing
  rules, teams, request types, or the audit ledger (append-only by
  design — audit rows from testing are expected and harmless).
- The AuditLog is **append-only and chain-sealed**. Never attempt to
  clean it; UAT rows are legitimate history.

### 0.5 Entry criteria

- [ ] Latest `main` deployed; `/api/health` returns 200.
- [ ] DB migrated (GitHub Action "Deploy migrations (prod)" green) and seeded.
- [ ] All personas can log in.
- [ ] Config matrix (0.2) recorded — attach a copy with each flag's state.

---

## Result tracking

Mark each case: ✅ Pass · ❌ Fail (log defect) · ⏭ N/A (config off) · ⚠ Pass-with-notes.

| Suite | Cases | Pass | Fail | N/A |
|---|---|---|---|---|
| 1 Access & navigation | 6 | | | |
| 2 Filing — form & Copilot | 8 | | | |
| 3 Filing — Self-Service | 3 | | | |
| 4 Filing — email & Teams channels | 6 | | | |
| 5 AI triage & agents | 7 | | | |
| 6 Triage Cockpit | 8 | | | |
| 7 Smart Routing rules | 8 | | | |
| 8 Teams (pools) & Pool Ops | 6 | | | |
| 9 Hand-offs & SLA custody | 5 | | | |
| 10 Work tracking, parties, conflicts | 7 | | | |
| 11 Lifecycle, Kanban, SLA ops | 7 | | | |
| 12 Notifications | 4 | | | |
| 13 Request Types admin & dynamic fields | 5 | | | |
| 14 Audit, timeline & observability | 6 | | | |
| 15 SSO & provisioning | 3 | | | |
| 16 Non-functional (mobile, a11y, resilience, perf) | 8 | | | |
| **Total** | **97** | | | |

---

## Suite 1 · Access & navigation

### INT-1-01 · Staff navigation is role-shaped
**Persona:** Lena (attorney)
1. Log in; open the intake app.
- Expected: tab bar shows **My Work · Inbox · Triage Cockpit · Kanban │ New Request · My Requests · Self-Service │ SLA Dashboard · Pool Ops · Smart Routing** with thin dividers. No Teams / Request Types tabs (admin-only).
- Expected: default landing tab is **My Work**.
**Result:** ☐ — Notes:

### INT-1-02 · Requester navigation is minimal
**Persona:** Alex Kim (requester)
1. Log in; open the intake app.
- Expected: exactly three tabs — **New Request · My Requests · Self-Service**; default landing **My Requests**. No staff surfaces reachable via the tab bar.
**Result:** ☐ — Notes:

### INT-1-03 · Admin sees config tabs
**Persona:** Alex Nguyen (admin)
- Expected: staff tabs **plus** Teams and Request Types behind a divider.
**Result:** ☐ — Notes:

### INT-1-04 · Anonymous requests hit the auth wall
**Persona:** none (incognito window)
1. Open the app URL logged out.
- Expected: redirect to the login screen (Auth0 / Microsoft). Direct API probe: `curl -i -X POST https://<domain>/api/claude` returns 307/302 to login — never 200.
**Result:** ☐ — Notes:

### INT-1-05 · Permission gating on staff APIs
**Persona:** Alex Kim (requester)
1. While logged in as a requester, open `https://<domain>/api/intake/pool-ops` in the browser.
- Expected: 403 (requester lacks `intake:read_all_tickets`). The UI never showed the tab in the first place (INT-1-02).
**Result:** ☐ — Notes:

### INT-1-06 · Viewer is read-only in practice
**Persona:** Felix (viewer)
1. Open Inbox → any ticket. 2. Attempt quick actions.
- Expected: reads work; mutations are refused server-side (no state change survives a refresh).
**Result:** ☐ — Notes:

---

## Suite 2 · Filing — New Request form & Copilot

### INT-2-01 · File a simple NDA request (form)
**Persona:** Alex Kim
1. New Request → name auto-filled from session (editable) → Department *Sales* → Type **NDA Request** → description: `UAT: Mutual NDA with Acme Robotics for Q3 pilot, 2-year term, Delaware law.` → Submit.
- Expected: success panel with ticket ID; either "Routed to <NDA agent> · recommendation generated" or "No matching agent" (config-dependent); buttons for *Inbox* and *Track it · My Requests*.
- Expected: ticket appears in **My Requests** immediately with a status.
**Result:** ☐ — Notes:

### INT-2-02 · Live pre-triage preview
1. On New Request, type a description mentioning "NDA" — watch the triage preview area.
- Expected: category/priority/SLA preview updates live as you type (regex preview; source label honest).
**Result:** ☐ — Notes:

### INT-2-03 · Urgency raises priority
1. File with Urgency **Emergency — deal blocker**.
- Expected: created ticket priority = **Critical** (visible on the ticket) regardless of classifier suggestion.
**Result:** ☐ — Notes:

### INT-2-04 · Submit gating
1. Empty name, or description < 10 chars with no attachment.
- Expected: Submit stays disabled (visually inert, not clickable). Filling requirements enables it.
**Result:** ☐ — Notes:

### INT-2-05 · Document upload — inline mode (Blob off) *(⏭ if Blob configured)*
1. Attach a small `.docx` or `.txt` (≤ 3 MB) containing recognizable contract text.
- Expected: "N chars extracted" chip; extracted text folded into the agent-read description; hint says **Max 3 MB**.
2. Attach a 4 MB file.
- Expected: instant friendly rejection (no network 413).
**Result:** ☐ — Notes:

### INT-2-06 · Document upload — direct/Blob mode *(⏭ if Blob not configured)*
1. Verify hint reads **Max 25 MB · original file retained**.
2. Attach a ~10 MB PDF.
- Expected: uploads (network tab shows a request to `blob.vercel-storage.com`, then `/finalize`); extraction chip appears; the Document row keeps the real blob URL (verify via Audit Log entry `intake.document.uploaded` with `storage: blob`).
3. Attach a 30 MB file → instant rejection.
**Result:** ☐ — Notes:

### INT-2-07 · Copilot conversational filing
**Persona:** Alex Kim
1. Open the Copilot (conversational intake) → answer its questions for an NDA (counterparty, purpose, term).
2. Submit when the Copilot says it's ready.
- Expected: ticket files with `_source: copilot`; conversation transcript is preserved on the ticket; empty-name submit shows a toast (not a browser alert).
**Result:** ☐ — Notes:

### INT-2-08 · Copilot topic switch
1. Start an NDA conversation, then describe an employment dispute.
- Expected: Copilot offers to switch topic; accepting restarts context on the new type; declining keeps the original.
**Result:** ☐ — Notes:

---

## Suite 3 · Filing — Self-Service deflection

### INT-3-01 · KB answers before filing
**Persona:** Alex Kim
1. Self-Service tab → search "NDA".
- Expected: relevant articles/FAQ entries render; count badge on the tab matches the library size.
**Result:** ☐ — Notes:

### INT-3-02 · File-from-article hand-off
1. From an article, click the file-a-ticket affordance.
- Expected: lands on New Request with the description pre-filled from the article context.
**Result:** ☐ — Notes:

### INT-3-03 · Policy Q&A
1. Ask a policy question the library covers (e.g. gifts policy).
- Expected: a direct answer with no ticket created; nothing appears in My Requests.
**Result:** ☐ — Notes:

---

## Suite 4 · Filing — email & Teams channels

> These use `curl`; replace `<domain>` and secrets. In production both
> endpoints are **fail-closed**: no secret configured → 503; wrong
> secret → 401. Idempotency uses the message id.

### INT-4-01 · Email webhook files a ticket
```bash
curl -sS -X POST https://<domain>/api/intake/email-webhook \
  -H 'content-type: application/json' \
  -H 'x-aegis-webhook-secret: <AEGIS_EMAIL_WEBHOOK_SECRET>' \
  -d '{"from":"Dana Lee","fromEmail":"dana@acme.example","subject":"UAT: NDA for Acme Robotics","body":"We need a mutual NDA before the pilot.","messageId":"uat-email-001"}'
```
- Expected: 200 with `ticketId`; ticket visible in Inbox with source `email`, classified + routed; server-side triage attaches a recommendation.
**Result:** ☐ — Notes:

### INT-4-02 · Email redelivery dedupes
1. Re-run INT-4-01 verbatim (same `messageId`).
- Expected: 200 with the **same** `ticketId` and `deduped: true`; no second ticket.
**Result:** ☐ — Notes:

### INT-4-03 · Email webhook auth is fail-closed
1. Repeat without the secret header.
- Expected (prod, secret configured): **401**. (Prod, secret NOT configured): **503**, never an open ingest.
**Result:** ☐ — Notes:

### INT-4-04 · Teams channel files a ticket *(⏭ if no Teams webhook; curl-verifiable in dev only, since prod requires a valid HMAC)*
In a Teams channel with the outgoing webhook configured:
1. `@AEGIS UAT: we need a data processing agreement with MedLab GmbH`
- Expected: in-channel reply within ~5 s: "✅ Filed as **<id>**" with type/priority/SLA/assignee and a `status <id>` hint. Ticket in Inbox with source `teams`.
**Result:** ☐ — Notes:

### INT-4-05 · Teams status & help commands
1. `@AEGIS status <id from 4-04>` → that ticket's status/stage/assignee.
2. `@AEGIS status` → your recent tickets. 3. `@AEGIS help` → usage.
**Result:** ☐ — Notes:

### INT-4-06 · Teams retry dedupes
1. (Dev/curl) POST the same activity `id` twice.
- Expected: second reply says "already filed as **<id>** — no duplicate created".
**Result:** ☐ — Notes:

---

## Suite 5 · AI triage & agents

### INT-5-01 · Agent match + recommendation (NDA)
**Persona:** Lena
1. File `UAT: standard mutual NDA with Vertex Analytics` (Type: NDA Request).
2. Open it in the Cockpit.
- Expected: recommendation panel shows the NDA agent, a drafted response, reasoning, confidence, concerns/citations where applicable. Source label honest (`CLAUDE LLM` or degraded template).
**Result:** ☐ — Notes:

### INT-5-02 · Vendor agent + sanctions screening
1. File a Vendor Due Diligence request naming a normal vendor.
- Expected: rec includes counterparty/sanctions context; a clean vendor screens clean (OFAC SDN feed or bootstrap list, per config).
**Result:** ☐ — Notes:

### INT-5-03 · No-match falls to manual triage
1. File Type **Other**, description `UAT: a novel situation no agent covers`.
- Expected: "No agent recommendation — manual triage required" panel; audit row `intake.ticket.agent_no_match`; ticket holder = **IN QUEUE**.
**Result:** ☐ — Notes:

### INT-5-04 · Complexity signal
1. File `UAT: we received a demand letter threatening litigation over patent infringement` → open detail.
- Expected: AI Triage header shows a **COMPLEX** pill (red).
2. File a template NDA with low risk → **SIMPLE** (green); anything else → STANDARD (amber).
**Result:** ☐ — Notes:

### INT-5-05 · Litigation agent populates parties (tracking-only)
1. File a Litigation Notice (`UAT: we have been served a summons by Meridian Corp in Delaware`).
- Expected: rec is tracking-oriented (no legal-hold action); Parties panel on the ticket has extracted parties (e.g. adverse party Meridian Corp).
**Result:** ☐ — Notes:

### INT-5-06 · Agents never auto-close
1. Observe any agent-processed ticket before attorney action.
- Expected: status remains awaiting review; only attorney actions close/approve. (Safety rule shown in ⚙ Agents panel.)
**Result:** ☐ — Notes:

### INT-5-07 · Agent settings + metrics
**Persona:** Alex Nguyen → ⚙ Agents
- Expected: per-agent enable/disable toggles persist across refresh; today's activity tiles; per-agent 7-day metrics (produced / accept / conf / degraded) when data exists; preview badges on demo-only agents.
**Result:** ☐ — Notes:

---

## Suite 6 · Triage Cockpit

**Persona:** Lena unless noted. Open **Triage Cockpit**.

### INT-6-01 · Keyboard-first approve
1. With a pending ticket focused, press **a**.
- Expected: approve toast (`✓ <id> approved…`); next ticket auto-focuses; ticket status Completed; `triagedBy` = Lena (verify on detail — not "You (Alex Nguyen)").
**Result:** ☐ — Notes:

### INT-6-02 · Edit-then-approve
1. Press **e**, modify the drafted response, save.
- Expected: `edited-approved` outcome; audit `intake.recommendation.edited_approved`; AgentDecision resolves APPROVED_WITH_OVERRIDE (Audit Log).
**Result:** ☐ — Notes:

### INT-6-03 · Reject
1. Press **x** (reject) on a rec.
- Expected: red toast; ticket goes to manual queue; audit `intake.recommendation.rejected`.
**Result:** ☐ — Notes:

### INT-6-04 · Reassign + snooze
1. Press **r** → pick Samira. 2. On another ticket press **s** (snooze).
- Expected: reassign sets the typed assignee (Samira sees it in **My Work**); snooze amber toast; audits `intake.recommendation.reassigned` / `…snoozed`.
**Result:** ☐ — Notes:

### INT-6-05 · Bulk approve
1. Select multiple pending tickets (checkboxes / **b**) → Approve All.
- Expected: one action approves all selected; count toast; per-ticket audit rows.
**Result:** ☐ — Notes:

### INT-6-06 · Matter auto-spawn on approval
1. Approve a matter-eligible ticket (e.g. NDA/Contract type).
- Expected: toast includes **"Matter <number> created"** with a working link to `/matter/<id>`; ticket carries the matter link; audit `intake.ticket.matter_spawned`. Gated on the AgentDecision being APPROVED.
**Result:** ☐ — Notes:

### INT-6-07 · Hand-off control
1. On the focused ticket click **⇄ Hand off** → to Samira, reason `UAT manual pass`.
- Expected: dialog validates (human requires a person); success toast; ticket holder chip shows **HELD · HUMAN**; keyboard shortcuts suspended while the dialog is open.
**Result:** ☐ — Notes:

### INT-6-08 · Agent activity tab
1. ⚙ Agents → Audit Log tab.
- Expected: the actions from this suite appear (approved/rejected/…); entries come from the canonical AuditLog (timestamps, attorney names) — not a local mirror.
**Result:** ☐ — Notes:

---

## Suite 7 · Smart Routing rules

**Persona:** Alex Nguyen (rule management needs admin) unless noted.

### INT-7-01 · Create a priority/SLA rule
1. Smart Routing → **+ New rule**: name `UAT NDA fast lane`, condition Type = NDA Request, action SLA = 8h. Save.
2. As Alex Kim, file an NDA.
- Expected: ticket arrives with SLA 8h; detail shows the fired rule; Cockpit shows the "routed by" chip; audit `intake.routing_rule.fired` (SYSTEM actor); rule's `timesFired` increments on the Smart Routing list.
**Result:** ☐ — Notes:

### INT-7-02 · Keyword + department conditions AND together
1. Rule: matchKeyword `acquisition` AND matchDepartment `Corporate` → priority High.
- Expected: fires only when **both** match; a Sales-department acquisition ticket does not fire it.
**Result:** ☐ — Notes:

### INT-7-03 · Complexity condition
1. Rule: matchComplexity **complex** → assign Marcus (gc).
2. File a high-risk litigation-flavoured ticket (COMPLEX pill).
- Expected: it lands on Marcus; a SIMPLE NDA does not fire the rule.
**Result:** ☐ — Notes:

### INT-7-04 · Escalate-to action
1. Rule: Type = Litigation Notice → **Escalate to** Marcus.
2. File a litigation ticket.
- Expected: ticket arrives **Critical**, status **Escalated**, assigned to Marcus; fired-rule text shows `escalate → Marcus Reyes`; audit `intake.ticket.escalated`. Re-saves don't re-fire (timesFired stable).
**Result:** ☐ — Notes:

### INT-7-05 · Approval gate (requireApprovalFrom)
1. Rule: matchKeyword `zephyr` → **Require approval from** Marcus.
2. As Alex Kim file `UAT: acquisition NDA for Project Zephyr`.
- Expected: ticket carries the **🔒 APPROVAL: MARCUS REYES** pill.
3. As **Lena**, try to approve it in the Cockpit.
- Expected: optimistic UI may flash, but after refresh the ticket is **still pending**; Ticket Timeline shows **"Approval blocked (gate)"** with Lena as the attempted actor. Reject/reassign still work for Lena.
4. As **Marcus**, approve it.
- Expected: approval lands normally.
**Result:** ☐ — Notes:

### INT-7-06 · Rule editor validation
1. Try saving a rule with no condition, then one with no action.
- Expected: inline warnings; save blocked both times.
**Result:** ☐ — Notes:

### INT-7-07 · Enable/disable + delete are audited
1. Toggle a rule off; delete another.
- Expected: disabled rule stops firing immediately; Audit Log has `intake.routing_rule.updated` / `…deleted` with before/after snapshots.
**Result:** ☐ — Notes:

### INT-7-08 · Attorney decisions beat rules
1. On a ticket Lena already triaged, edit + save anything.
- Expected: routing rules do not touch it (no new fired entries).
**Result:** ☐ — Notes:

---

## Suite 8 · Teams (pools) & Pool Ops

**Persona:** Alex Nguyen for setup; Thomas (legal_ops) for the dashboard.

### INT-8-01 · Create a two-tier pool with overflow
1. Teams tab → create **UAT Tier 1** (least_loaded), members Samira (capacity 2), Lena (capacity 2).
2. Create **UAT Tier 2** (round_robin), member Marcus (capacity 0 = ∞).
3. Set Tier 1 overflow → Tier 2.
- Expected: cards render members with capacity chips; edits persist.
**Result:** ☐ — Notes:

### INT-8-02 · Route-to-pool balances load
1. Smart Routing rule: Type = Contract Review → **route to pool** UAT Tier 1.
2. File 3 contract-review tickets.
- Expected: assignments spread across Samira/Lena by least-loaded; fired text `pool UAT Tier 1 → <name>`.
**Result:** ☐ — Notes:

### INT-8-03 · Overflow when at capacity
1. File contract-review tickets until both Tier-1 members hit capacity (2 open each), then one more.
- Expected: the extra one lands on Marcus with fired text ending **`(overflow)`**.
**Result:** ☐ — Notes:

### INT-8-04 · Pool Ops dashboard
**Persona:** Thomas → Pool Ops tab.
- Expected: summary strip (open in pools / awaiting pickup / routed / overflow events / closed 7d); per-team cards with member utilization bars (`n / cap · %`, `∞ cap` for unbounded), complexity mix chips, `Routed · Closed 7d/30d`, `x VIA OVERFLOW` pill after INT-8-03.
**Result:** ☐ — Notes:

### INT-8-05 · Effort shows per tier
1. (After INT-10-05 logs minutes) revisit Pool Ops.
- Expected: the member's tier card shows **Effort <x>h/<x>m**.
**Result:** ☐ — Notes:

### INT-8-06 · Direct assignee beats pool
1. On one rule set both a direct assignee and a pool.
- Expected: editor warns; at fire time the direct assignee wins.
**Result:** ☐ — Notes:

---

## Suite 9 · Hand-offs & SLA custody

### INT-9-01 · Auto baton-pass on agent processing
1. File a fresh NDA (agent matches, routing assigns someone).
2. Open the ticket detail.
- Expected: holder pill **HELD · HUMAN** (or **IN QUEUE** if unassigned); Ticket Timeline shows the agent's automatic hand-off ("Baton passed") — nobody logged it manually.
**Result:** ☐ — Notes:

### INT-9-02 · Manual hand-off validation
1. Cockpit → ⇄ Hand off → choose **human** without picking a person.
- Expected: validation error. Queue/agent passes need no person.
**Result:** ☐ — Notes:

### INT-9-03 · Holder chip states
- Expected across tickets: 🤖 WITH AGENT (purple) / HELD · HUMAN (cyan) / IN QUEUE (slate) render *per the ticket's actual custody*.
**Result:** ☐ — Notes:

### INT-9-04 · SLA custody legs panel
1. Open any ticket with hand-off history.
- Expected: **SLA Custody Legs** panel — proportional bar segmented by holder, red marker at 100 % of the SLA window, legend rows with holder / elapsed / % of window, HOLDING NOW on the live leg. Legend labels resolve names (not raw IDs).
**Result:** ☐ — Notes:

### INT-9-05 · Breach pins to the holding leg
1. On a breached ticket (or after INT-11-06 forces breaches):
- Expected: exactly one leg carries **⚠ BREACH HAPPENED HERE**; total elapsed matches the header SLA figures; a hand-off after breach does not reset anything.
**Result:** ☐ — Notes:

---

## Suite 10 · Work tracking, parties & conflicts

Open a ticket detail (Cockpit right rail hosts Work + Parties panels).

### INT-10-01 · Delivery work status
1. Work panel → set work status (e.g. In progress → Blocked).
- Expected: persists across refresh; distinct from the triage status; audit `intake.ticket.work_status_changed`.
**Result:** ☐ — Notes:

### INT-10-02 · Assignments with roles
1. Add Samira as lead, Lena as reviewer.
- Expected: both listed with roles; removable; audited.
**Result:** ☐ — Notes:

### INT-10-03 · Sub-tasks lifecycle
1. Add task `UAT: draft the NDA` → click status chip to cycle open → in_progress → done.
- Expected: cycles persist; done renders strikethrough; audits per change.
**Result:** ☐ — Notes:

### INT-10-04 · Effort quick entry
1. On the task press **+30m** twice, **+15m** once.
- Expected: ⏱ chip shows **1h 15m**; Ticket Timeline gains effort entries; Audit Log rows `intake.task.effort_logged` carry minutes + running total.
**Result:** ☐ — Notes:

### INT-10-05 · Parties panel CRUD
1. Parties panel → + Add → counterparty **Acme** as adverse party, note `UAT`.
- Expected: row renders with role chip; delete works; both audited.
**Result:** ☐ — Notes:

### INT-10-06 · Conflict check (one brain)
1. On a party row click **⚖ Conflicts**.
- Expected: inline result — every intake ticket AND every matter involving that entity, each with `via <role>` attribution; green "no other engagements" state when clean; footer says the check was recorded (verify `intake.conflict_check.run` in Audit Log). Click again collapses.
**Result:** ☐ — Notes:

### INT-10-07 · Litigation tracking view
1. Open the litigation ticket from INT-5-05 → litigation view.
- Expected: matter-style tracking surface with parties, dates, posture — no legal-hold actions offered.
**Result:** ☐ — Notes:

---

## Suite 11 · Lifecycle, Kanban & SLA operations

### INT-11-01 · Server-enforced stage advancement
1. Ticket detail → **Advance Stage**.
- Expected: stage moves one step; workflow strip updates; repeat to final stage — the button becomes ✓ Completed and further clicks no-op; audit `intake.ticket.stage_advanced` per hop; stage timestamps recorded (feeds custody legs).
**Result:** ☐ — Notes:

### INT-11-02 · Configured-type stages drive the workflow
1. File under a configured request type with custom stages (Suite 13 setup).
- Expected: the ticket's workflow strip shows the configured stages; Advance walks **that** sequence.
**Result:** ☐ — Notes:

### INT-11-03 · Kanban drag persists
1. Kanban tab → drag a card New → In Review.
- Expected: card stays after refresh; ticket detail agrees (stage + status coherent); on tablets the board scrolls sideways rather than crushing columns.
**Result:** ☐ — Notes:

### INT-11-04 · Inbox filters & windowing
1. Inbox → click each filter chip (All / My Queue / SLA Breached / At Risk / In Review / Auto-Completed / New (You)).
- Expected: counts match rows; **My Queue** = typed-assignee tickets only. With > 60 rows, a "▾ Show more · N remaining" footer pages the list.
**Result:** ☐ — Notes:

### INT-11-05 · SLA dashboard
1. SLA Dashboard tab.
- Expected: queue-health tiles, per-team/attorney workload, rule-effectiveness list (timesFired / last fired) consistent with Suite 7 activity.
**Result:** ☐ — Notes:

### INT-11-06 · Server-side breach scan
**Persona:** Alex Nguyen
1. `curl -X POST https://<domain>/api/admin/jobs/intake-sla-scan -H 'cookie: <admin session>'` (or trigger from an admin surface / rely on the scheduler if wired).
- Expected: JSON `{scanned, breached, escalatedTicketIds}`; overdue open tickets flip to **Escalated / Overdue**; audits `intake.ticket.sla_breached` + `intake.ticket.auto_escalated`; **idempotent** — a second run reports 0 new breaches.
**Result:** ☐ — Notes:

### INT-11-07 · Deep links
1. `/?view=…` deep links and the 307 admin redirects (`/admin/users` → users view) resolve; opening a ticket from My Work / My Requests lands on the right detail.
**Result:** ☐ — Notes:

---

## Suite 12 · Notifications

> Without an org intake mailbox, sends are **recorded, not delivered**
> (`delivered:false · no-mailbox`) — that is a PASS for the recorded
> expectation. With a mailbox + delegated M365 auth, expect real email.

### INT-12-01 · Assignment notification
1. Reassign a ticket to Samira (Cockpit **r**).
- Expected: Ticket Timeline gains **"Notification sent"**; Audit Log `intake.notification.sent` with `{kind: assignment, to: samira…, delivered: true|false(no-mailbox)}`.
**Result:** ☐ — Notes:

### INT-12-02 · Stage + closure notify the requester
1. Advance a stage; later approve/close the ticket.
- Expected: `kind: stage` and `kind: closure` notification events addressed to the requester's email.
**Result:** ☐ — Notes:

### INT-12-03 · Per-user toggles
**Persona:** Samira → ⚙ Agents → 🔔 Email notifications
1. Toggle **Assigned to me** off (persists across refresh) → have admin reassign a ticket to her.
- Expected: **no** notification event for that assignment (skipped, no audit row). Master switch off dims + silences everything.
**Result:** ☐ — Notes:

### INT-12-04 · Notification failure never breaks the action
1. With no mailbox configured, perform any triggering action.
- Expected: the action itself always succeeds; notification is recorded-only. (Contract: notify can never roll back a mutation.)
**Result:** ☐ — Notes:

---

## Suite 13 · Request Types admin & dynamic fields

**Persona:** Alex Nguyen for admin; Alex Kim for filing.

### INT-13-01 · Create a configured type with stages
1. Request Types → + New type: name `UAT Trademark Clearance`, workstream `Trademarks`, stages `Intake, Search, Opinion, Filed`.
- Expected: card renders with numbered stages; active toggle + delete work; audited.
**Result:** ☐ — Notes:

### INT-13-02 · Define custom fields
1. On the card → **▸ Edit fields**: add `Mark name` (text, required), `Classes` (number), `Region` (select: `US, EU, IN`), `Prior use?` (boolean). Save.
- Expected: card shows "4 custom fields"; reopening the editor shows saved rows.
**Result:** ☐ — Notes:

### INT-13-03 · Dynamic fields on New Request
1. As Alex Kim → New Request → pick **▣ UAT Trademark Clearance**.
- Expected: the 4 fields render in a "details" block (select shows options; boolean is a toggle); workflow preview shows the configured stages; leaving `Mark name` empty keeps Submit gated with a "Required for…" hint.
**Result:** ☐ — Notes:

### INT-13-04 · Values persist and reach the agent
1. Fill fields, submit, open the ticket.
- Expected: **Request details (structured)** block under the header with the answers; the description the agent read contains `[Request details] Mark name: …` lines.
**Result:** ☐ — Notes:

### INT-13-05 · Type switch resets field values
1. On New Request fill the fields, then switch type and switch back.
- Expected: values cleared on switch (clean slate per type); no stale cross-type values submitted.
**Result:** ☐ — Notes:

---

## Suite 14 · Audit, timeline & observability

### INT-14-01 · Ticket Timeline is the one story
1. Open a ticket that lived a full life (filed → routed → handed off → advanced → notified → approved).
- Expected: timeline lists every event in order with humanized labels, actor styling (🤖 AGENT purple / SYSTEM / named users), relative times, and per-row chain stamps (`#position · hash…`) under a **CHAIN-SEALED** badge.
**Result:** ☐ — Notes:

### INT-14-02 · Audit ledger completeness spot-check
**Persona:** Alex Nguyen → Audit Log view
1. Filter/scan for today's UAT actions.
- Expected: every mutation performed in Suites 2–13 has a row (created / assigned / stage_advanced / routing_rule.fired / handoff / effort_logged / notification.sent / conflict_check.run / recommendation.\* / escalated / closed …) with correct actor + actorType.
**Result:** ☐ — Notes:

### INT-14-03 · Chain verification
1. Audit Log → run **Verify** (or `GET /api/audit-log` verify action).
- Expected: chain verifies end-to-end; export produces the defensibility report.
**Result:** ☐ — Notes:

### INT-14-04 · Structured request logs
**Persona:** whoever has Vercel access
1. Vercel → project → Logs while clicking around the app.
- Expected: JSON lines `"kind":"request"` with method/route/status/ms/requestId on the hot routes; no query strings; no secrets.
**Result:** ☐ — Notes:

### INT-14-05 · Slow + error events
1. Filter logs for `"kind":"slow-query"` / `"slow-request"` / `"client-error"` / `"exception"`.
- Expected: shapes match; `client-error` rows appear if you force a browser error (e.g. a contained panel crash).
**Result:** ☐ — Notes:

### INT-14-06 · Crash → clean 500
1. (If reproducible) hit a wrapped route with a payload that throws.
- Expected: clean `{ok:false,error:"Internal error"}` 500 (no stack leak); `exception` log line carries the route + requestId.
**Result:** ☐ — Notes:

---

## Suite 15 · SSO & provisioning *(⏭ until Entra config is done — see docs/entra-sso-onboarding.md)*

### INT-15-01 · Enterprise login goes straight to Microsoft
1. With `AUTH0_ENTERPRISE_CONNECTION` set: incognito → app URL → login.
- Expected: Microsoft sign-in page (client tenant) directly — no Auth0 account picker. MFA/conditional access enforced by the tenant.
**Result:** ☐ — Notes:

### INT-15-02 · JIT provisioning (allowed domain)
1. First-ever login with a client-tenant account on an allowlisted domain.
- Expected: lands as a **requester** (3-tab nav); Admin → Users shows the new user with requester role; Audit Log `auth.user.jit_provisioned`; filing a ticket attributes correctly (linked Person).
**Result:** ☐ — Notes:

### INT-15-03 · Strict mode outside the allowlist
1. Login with a verified account whose domain is NOT allowlisted (and not seeded).
- Expected: refused (no session resolution / no data), no user row created.
**Result:** ☐ — Notes:

---

## Suite 16 · Non-functional

### INT-16-01 · Phone — requester journey
1. On a phone (or ≤ 640 px window): New Request, My Requests, Self-Service.
- Expected: single-column layouts; type grid 2-wide; dynamic fields single-column; no horizontal page scroll; all actions tappable.
**Result:** ☐ — Notes:

### INT-16-02 · Tablet — staff journey
1. ≤ 1024 px: Cockpit, Inbox, Kanban, ticket detail.
- Expected: Cockpit stacks panels; Inbox table and Kanban board scroll sideways **inside their cards**; detail panels stack.
**Result:** ☐ — Notes:

### INT-16-03 · Keyboard-only pass
1. Unplug the mouse: Tab through nav → Inbox → open a ticket (Enter) → back → toggle a filter (Space).
- Expected: visible cyan focus ring everywhere; every daily-path control operable; Cockpit letters (a/e/r/x/s/j/k) still work.
**Result:** ☐ — Notes:

### INT-16-04 · Screen-reader spot check
1. With VoiceOver/NVDA: New Request form fields; a toast firing; a panel error.
- Expected: fields announce their labels (+ required); toasts announce (status/alert live regions); error fallbacks announce as alerts.
**Result:** ☐ — Notes:

### INT-16-05 · Reduced motion
1. Enable OS "reduce motion"; reload.
- Expected: fade/slide animations are gone; app fully usable.
**Result:** ☐ — Notes:

### INT-16-06 · Error containment
1. If any panel errors during UAT (or force one), observe.
- Expected: a contained "⚠ … was contained" card with **Retry**; nav/header/siblings keep working; no blank page. A `client-error` log line lands server-side.
**Result:** ☐ — Notes:

### INT-16-07 · Delta saves (perf contract)
1. DevTools → Network → approve one ticket in the Cockpit; drag one Kanban card.
- Expected: each save request body contains **only the changed ticket(s)**, not the whole array.
**Result:** ☐ — Notes:

### INT-16-08 · Concurrency sanity
1. Two staff sessions (Lena + Alex) on the Cockpit; both act on different tickets; one refreshes.
- Expected: no lost updates on *different* tickets; routing/attribution reconverge to server-canonical state after refresh. (Same-ticket simultaneous edits: last-write-wins is the known, accepted behavior — note anything worse.)
**Result:** ☐ — Notes:

---

## 17 · Exit criteria

- 100 % of applicable cases executed; ⏭ N/A only where the config
  matrix (0.2) justifies it.
- No open **Critical/High** defects; Medium defects have owner + plan.
- Suite 14 (audit completeness + chain verify) passed — non-negotiable
  for the compliance story.
- Sign-off recorded below.

## 18 · Defect log

| # | Case ID | Severity (C/H/M/L) | Summary | Steps / evidence | Status | Owner |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |

Severity guide — **C**: blocks the pilot / data loss / security.
**H**: core flow broken, no workaround. **M**: broken with workaround
or wrong-but-recoverable. **L**: cosmetic.

## 19 · Sign-off

| Role | Name | Date | Verdict |
|---|---|---|---|
| UAT lead | | | ☐ Approved ☐ Approved w/ conditions ☐ Rejected |
| Business owner | | | |
| Technical owner | | | |
