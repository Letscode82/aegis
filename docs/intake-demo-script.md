# AEGIS Intake — End-to-End Demo Script

> A guided walkthrough of **every intake feature**, in a narrative
> order that builds to the agent layer. Use this to run a live demo
> for a client or internal stakeholder.
>
> - For pass/fail test execution, use
>   [`uat-intake-e2e.md`](./uat-intake-e2e.md) (97 cases) +
>   [`uat-intake-e2e-tracker.csv`](./uat-intake-e2e-tracker.csv).
> - For a written client manual, use
>   [`intake-user-guide.md`](./intake-user-guide.md).
> - Full run: **45–60 min**. Short path (§9): **15 min**.

---

## 1 · Before the demo (10 minutes, once)

| Check | How |
|---|---|
| Demo site loads | Open the Vercel production URL; sign in (Auth0) or dev-mode admin |
| Reset to a clean state | Top-right **↻ Reset Demo** → confirm. Restores the seeded v8 dataset |
| AI is live | File any NDA request; the recommendation should show a confidence ≠ 0.4. If every rec shows the amber "AI review unavailable" banner, `ANTHROPIC_API_KEY` is missing — the demo still works (see §5 "degraded mode is a feature") |
| Second persona ready | An incognito window with `DEV_USER_EMAIL` set to a requester user (or a second Auth0 test user) for the requester-side view |
| Phone (optional) | Open the site on a phone for the mobile pass moment (§8) |

**Cast of personas** (seeded): Alex Nguyen (admin / triage attorney),
requester users per department, agent pool members for Pool Ops.

---

## 2 · Act 1 — The requester experience (5 min)

Story: *a business user needs legal help and never sends an email.*

1. **Self-Service** (left nav) — searchable articles answer the
   routine questions before a ticket exists. Point out the article
   count on the nav badge.
2. **New Request** — pick **NDA Request** from the simple types.
   Point out:
   - The **type picker** separates template-fit simple types from
     sensitive/complex ones.
   - **Dynamic request-type fields** (W3-3): types configured in
     Request Types admin render their own structured fields here.
   - **Attachments**: drag a file — uploads go direct-to-Blob (W4-6),
     so a 50 MB deck doesn't lock the form.
3. Submit with description:
   > `Need a mutual NDA with Acme Robotics for the pilot`
4. **My Requests** — the requester sees live status, the stage
   tracker (Submitted → Agent Analysis → Attorney Review → Close),
   and SLA state. They never see internal reasoning — only the
   approved output once an attorney releases it.

---

## 3 · Act 2 — The agent layer (the star, 15 min)

Story: *eleven specialists, one router, zero unsupervised actions.*

Open **⚙ Agents** (top right) first: show the registry — 11 agents,
each with per-agent success/failure/latency metrics and an on/off
toggle. Close it and file the tickets below from **New Request**
(use the type named; where none is named pick **Other** — the
router reads the description).

After each submission, open the ticket in the **Triage Cockpit** and
show the recommendation panel: **confidence, suggested action,
drafted response, concerns, the ⚖ "Risks to weigh before approving"
checklist, and the playbook chip** (which standard + version was
applied — every review is reproducible).

### 3.1 NDA Agent — the happy path *and* the deviation tree

| Input | Expect |
|---|---|
| Type **NDA Request**: `Need a mutual NDA with Acme Robotics for the pilot` | **approve-and-send** — clean template fit; prior-relationship check ran against the real Counterparty table |
| Type **NDA Request**: `NDA with Acme Robotics but they want perpetual confidentiality with no expiry` | **flag-for-review** — "Playbook deviation" concern; confidence capped. The agent knows what it must NOT approve |

### 3.2 Vendor Intake Agent — sanctions screening

Type **Vendor Due Diligence**:
> `Vendor: Globex Corp in Germany, new supplier onboarding`

Point out the sanctions screen in the concerns (OFAC SDN / EU / UK
lists — real Treasury feed). Talking point: a **hit escalates and can
never be auto-approved**; an **unavailable list flags for manual
screening** — the agent never claims "clear" when it didn't check.

### 3.3 Trademark Agent

Type **Trademark Check**:
> `Trademark clearance for "Zephyrion" in US and EU`

Risks panel says what it is NOT: not a registry search; common-law
marks are invisible; the formal USPTO/EUIPO search stays mandatory.

### 3.4 Notice Management Agent ⚑ *(new — doc Agent 9)*

Type **Other**:
> `Notice of breach received — cure within 30 days of receipt.`

The demo moment:
- **Deadline extracted deterministically** — never by the LLM — and
  the concern **cites the exact source text** it was parsed from.
- **SLA auto-tightened** to the shortest deadline (watch the
  ticket's SLA change), with an `intake.ticket.sla_tightened` audit
  row written by the AGENT actor.
- Breach/termination taxonomy → **escalate**.
- The acknowledgment draft is deliberately **minimal and
  rights-reserving** — a loose "thanks, we agree to review" can waive
  rights; the agent refuses to write one.

Try also: `Show cause notice from the regulator — respond within 14
days of receipt.` (regulatory → escalate, urgency rank 1/5).

### 3.5 Contract-Type Specialist ◈ *(new — doc Agent 11)*

| Input (type **Contract Review**) | Expect |
|---|---|
| `Please review the software licensing agreement from Vertex Labs — royalty of 4% on net sales` | **Licensing playbook v1** applied — the first concern names the playbook, its owner, review date, and the exact text it matched on |
| `Exclusive licensing agreement for the EU territory, 5-year term` | **escalate** — the exclusivity gate from the approval matrix fired *in code*, before the LLM ran |
| `Clinical trial agreement for study AX-201 with three investigator sites` | **escalate** — clinical always goes to senior counsel regardless of value |
| `MSA review — uncapped liability and 90-day auto-renewal` | Falls through to the **generalist Contract Review agent** (no type playbook matched) — the fallthrough is by design, and both produce ACCEPT / NEGOTIATE / REJECT severity bands |

### 3.6 Privacy Assessment Agent ◉ *(new — doc Agent 7)*

| Input (type **Other**) | Expect |
|---|---|
| `Need a DPIA for the new analytics tool processing customer data` | flag-for-review with regime triggers listed as "verify applicability" (no jurisdiction stated) and the **GAPS list** — what the requester did NOT tell us (retention, volume, processors, lawful basis) |
| `Launching a wellness portal storing employee health records` | **HIGH rating → escalate** — sensitive-category processing goes to the senior counsel / DPO path, always |

Talking point: the rating is deterministic (category × volume ×
transfer × novelty); the gaps list turns a vague request into the
exact follow-up questions counsel would ask.

### 3.7 Marketing Review Agent ◭ *(new — doc Agent 8)*

| Input (type **Other**) | Expect |
|---|---|
| `Please review the promotional material for the spring campaign` | **fast-track** route — no claim signals detected (still human-approved) |
| `Ad copy: our device prevents infections, FDA-approved` | **escalate** — regulated/therapeutic claims are NEVER agent-cleared; the concern says so with the matched text |
| `Social media campaign: the best platform, #1 in the market` | **revise** — superlatives flagged for substantiation with suggested compliant wording |

### 3.8 Litigation Agent § *(upgraded — doc Agent 10)*

Type **Other**:
> `We received a demand letter from Meridian Corp regarding the supply contract, 20-day deadline`

The demo moment — the **cited case brief**:
- **Record pull**: the adverse party was extracted and resolved
  against the shared Counterparty entity — prior matters and prior
  agreements are cited as record facts (this is the "one brain"
  pitch: intake reads the same entities as matters and contracts).
- If the party has no record, the concern says the discipline out
  loud: *the record is not the world — absence of documents is not
  absence of exposure.*
- **Legal-hold trigger flag** with a proposed initial scope
  (requester mailbox + shared drives + adverse-party
  correspondence) — over-inclusive by design, and the agent **never
  places the hold**; counsel does.
- Brief structure: Parties / Contract Landscape / Chronology /
  Exposure / Related Matters / Open Obligations / **Gap Analysis**.

### 3.9 FAQ + Policy Q&A — and the refusal that sells governance

| Input (type **Legal Question — General**) | Expect |
|---|---|
| `What is our data retention period for customer data?` | FAQ agent answers from the curated KB, ending with the "general guidance, not advice for your specific facts" line |
| `What does our travel policy say about business class?` | Policy Q&A cites the policy corpus |
| `What is our data retention period — we are in a lawsuit and got a subpoena` | The FAQ agent **refuses** (dispute/regulator/deadline wording) and the ticket routes onward — hard handoff triggers in code |

### 3.10 Degraded mode is a feature (30 seconds of talk track)

If Claude is unreachable, every agent still ships its deterministic
findings — the Notice agent's deadlines, the Privacy agent's rating
and gaps, the Specialist's playbook selection — at **capped 0.4
confidence, flag-for-review, never auto-send**. The safety invariant
is one chokepoint in code (`buildDegradedRec`), not a per-agent
promise.

---

## 4 · Act 3 — The attorney workbench (10 min)

Story: *one attorney clears a morning queue in minutes.*

1. **My Work** — the personal inbox: everything assigned to me,
   ordered by SLA pressure.
2. **Triage Cockpit** — the core loop on the tickets you just filed:
   - **Keyboard shortcuts**: `A` approve · `E` edit-approve · `R`
     reject · `S` snooze — clear three tickets without touching the
     mouse.
   - Every approve/reject writes a **chain-sealed audit row**; the
     approval keystroke is the ONLY path from PENDING to APPROVED
     (the AgentDecision gate is schema-enforced, not prompt-enforced).
   - **Agent Activity tab** — the same audit ledger, read back as a
     feed (no parallel logs).
   - **Parties panel** → add `Meridian Corp` → **⚡ Conflict check**:
     every ticket and matter touching that counterparty, one click,
     itself audited ("we looked, on this date, and found N").
   - **Work panel** — tasks + **effort capture** (W3-5) logging
     hours per ticket.
   - **Hand-off control** — agent ↔ human baton with reason capture;
     auto baton-pass fires on the triggers configured in W2-2.
   - **Litigation card** — on the demand-letter ticket, the tracking
     view summarises the dispute posture.
3. **Kanban** — drag the NDA ticket between swimlanes: drag-to-
   reassign is a real mutation with an `intake.ticket.assigned`
   audit row, not UI sugar.
4. **Bulk approve** — select several clean tickets in the Cockpit,
   approve in one keystroke; each writes its own audit row.

---

## 5 · Act 4 — Operations & the GC view (8 min)

1. **SLA Dashboard** — queue health, breach forecast; open a ticket's
   **SLA legs panel** to show multi-leg SLA (W2-4): per-stage clocks,
   not one blunt timer. Recall the Notice agent *tightening* a leg
   automatically in §3.4.
2. **Pool Ops** — team pools with round-robin / least-loaded
   strategies, live workload per member, effort rollups.
3. **Smart Routing** — the rules engine: conditions (type, priority,
   department, keyword, agent-suggested action, **complexity**)
   → actions (assign, set priority, set SLA, route to pool,
   **escalate to**, **require approval from**). Every fired rule is
   audited and the Cockpit shows which rule fired on each ticket.
4. **Teams** (admin) — Microsoft Teams as an intake channel (W3-1):
   a channel message becomes a ticket through the same pipeline.
   Mention the **email webhook** twin (`POST /api/intake/email-webhook`)
   — demoable with curl, no M365 dependency.
5. **Request Types** (admin) — define a type, its stages, and its
   structured fields; the New Request form re-renders instantly
   (this is where client-specific intake forms come from).
6. **Notifications** — outbound templates (W3-2) fire on assignment /
   approval / escalation.
7. **Audit Log** (platform, `/audit-log`) — the differentiator
   closer: every mutation in tonight's demo is in the
   **cryptographically chained ledger** (SHA-256, append-only,
   tamper-evident). Run the verify action. Nothing you did tonight
   can be silently rewritten.

---

## 6 · Act 5 — Platform quality moments (3 min, sprinkle throughout)

- **Mobile** — open the site on a phone: New Request and My Requests
  are phone-first (W4-3).
- **Instant feel** — every mutation is optimistic with server
  reconciliation (W4-1); delta saves keep sync fast at scale (W4-2).
- **Accessibility** — keyboard-only walk through the Cockpit; panels
  are focus-managed and screen-reader labelled (W4-4).
- **Resilience** — if a panel ever errors, it's contained by a panel
  boundary and the rest of the page keeps working (W4-1).
- **Enterprise sign-in** — Entra ID SSO with JIT provisioning (W4-7,
  config-gated; see `entra-sso-onboarding.md`).
- **Observability** — request logs + error capture behind the scenes
  (W4-5).

---

## 7 · The 11 agents at a glance (cheat sheet)

| # | Agent | Trigger to type into New Request | Watch for |
|---|---|---|---|
| 1 | NDA ◉ | `Need a mutual NDA with Acme Robotics for the pilot` | approve-and-send; prior-NDA lookup |
| 2 | Vendor ⬡ | type Vendor Due Diligence: `Vendor: Globex Corp in Germany, new supplier onboarding` | sanctions screen trail |
| 3 | Trademark ⚖ | `Trademark clearance for "Zephyrion" in US and EU` | "not a registry search" risks |
| 4 | Contract Review ◐ | `MSA review — uncapped liability and 90-day auto-renewal` | ACCEPT/NEGOTIATE/REJECT bands |
| 5 | FAQ ◎ | `What is our data retention period for customer data?` | KB answer + guidance framing |
| 6 | Policy Q&A ▤ | `What does our travel policy say about business class?` | policy citation |
| 7 | Privacy ◉ *(new)* | `Launching a wellness portal storing employee health records` | HIGH → escalate; gaps list |
| 8 | Marketing ◭ *(new)* | `Ad copy: our device prevents infections, FDA-approved` | regulated claim → never agent-cleared |
| 9 | Notice ⚑ *(new)* | `Notice of breach received — cure within 30 days of receipt.` | cited deadline; SLA tightened |
| 10 | Litigation § *(upgraded)* | `We received a demand letter from Meridian Corp regarding the supply contract` | cited case brief; hold-trigger flag |
| 11 | Contract Specialist ◈ *(new)* | `Exclusive licensing agreement for the EU territory, 5-year term` | playbook stamp; exclusivity gate → escalate |

Every recommendation carries: confidence · suggested action · drafted
response · concerns (with citations) · **⚖ risks checklist** ·
**playbook chip (id + version)**.

---

## 8 · The one-brain closer (talk track, 1 min)

Point at what just happened across the demo:

- The **NDA agent** read the same Counterparty row the **Litigation
  agent** cited in its case brief and the **conflict check** queried.
- The **Notice agent's** deadline changed the same SLA the dashboard
  forecasts and the routing rules act on.
- Every agent decision, keystroke, and rule firing landed in **one
  chained audit ledger**.

No point tool does this, because no point tool owns the shared
entities. That is the GC Suite pitch in one demo.

---

## 9 · Short path (15 minutes)

1. New Request → NDA happy path → Cockpit approve with `A` (2 min)
2. Notice of breach → cited deadline + SLA tightening + escalate (3 min)
3. Demand letter → cited case brief + record pull + hold trigger (3 min)
4. Wellness portal → HIGH privacy escalation + gaps list (2 min)
5. Smart Routing rule fired on a ticket + Pool Ops glance (2 min)
6. Audit Log verify — the chained ledger closer (3 min)

---

## 10 · Appendix — pending / not in this demo

**Awaiting Harsha (user-side):**
- Wave-4 gate: functional test of the wave 2–4 backlog + UAT
  execution (`uat-intake-e2e.md` — 97 cases ready to run).
- Ops hygiene: rotate the Neon `neondb_owner` password; bump Vercel
  to Node 24.x; delete the leftover `PROD_DATABASE_URL` repo
  *Variable* (the Secret is the one in use).
- Optional config to light up dormant features: Vercel Blob store
  (uploads), Entra ID SSO env vars, Teams webhook URL.

**Deliberately deferred (roadmap, documented):**
- PR #5 — Intake `internal/api` module split (after P1–P4, per
  CLAUDE.md).
- PR #6 — Spend & Counsel module (sunsets the cost-basis stub).
- 4d — Matter / Legal Hold AI features (unfreeze post-Intake).
- pg-boss worker runtime (scheduled jobs currently run as admin HTTP
  triggers — the documented pattern).
- KMS envelope encryption for M365 secrets (before first paying
  customer).

**Agent plan (doc) — remaining by design:**
- Phase C2/C3 GraphRAG: embedding-provider decision (Voyage/other)
  → pgvector rank fusion → natural-language brain surface. Plan and
  constraints in [`agent-brain-graphrag.md`](./agent-brain-graphrag.md).
- DB-backed, admin-editable contract playbooks (the B2 catalog is
  code-versioned; the admin editor is the follow-up).
- Governed claims library for Marketing (seeded set today; ontology
  `Claim` nodes in Phase C).
- Conversational intake channel (doc roadmap item).
