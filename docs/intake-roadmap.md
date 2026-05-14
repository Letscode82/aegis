# Intake-first roadmap (proposal · v2)

> **Status: PROPOSAL.** Planning artifact only. Nothing in
> [`CLAUDE.md`](../CLAUDE.md) or [`PRODUCT.md`](../PRODUCT.md) has
> been edited. File and line references throughout are anchors so
> every claim is verifiable against `main`.
>
> **v2 update.** Operator direction: the existing UI surfaces
> (Inbox, New Request, Triage Cockpit, Kanban, SLA Dashboard,
> Smart Routing, Self-Service) are the right surfaces. The work is
> to **productionize** them — make every flow real on persisted
> data, audit-sealed, against real users — not invent new surfaces.
> Email ingestion is pushed to the very end so M365/Graph
> debugging doesn't block the end-to-end demo.

---

## 1. The GC's problem, in his own words

> "I get hundreds of emails. I miss things I needed to be involved in."

Translated to platform terms:

1. **No unified inbox.** Email, Slack, web forms, M&A counsel
   requests arrive in different channels. Nothing aggregates them.
2. **No triage signal.** Without a structured queue, the GC
   pattern-matches on subject lines alone.
3. **No accountability layer.** Once forwarded to an attorney, the
   GC has no defensible record of acknowledgment, work, or
   closure within SLA.
4. **No escalation guarantee.** Items that should escalate back
   (privilege, settlement authority, regulatory exposure, employee
   complaints touching the C-suite) only escalate when a human
   remembers to flag them.

The wedge is **workflow management**. AI is a node in the workflow
— not a replacement for it. Every downstream feature (Matter, Spend,
Hold, Privacy, Regulatory) consumes triaged intake events. Weak
intake makes everything below it inherit the weakness.

---

## 2. What exists today

Audit-grade inventory of `@aegis/intake` against `main`.

### 2.1 Shipped (works end-to-end)

| Capability | Where | Notes |
|---|---|---|
| Ticket persistence | `IntakeTicket` + [`intakeStorageGet/Set`](../modules/intake/src/storage/server.ts) | Status enum: AWAITING_TRIAGE → IN_REVIEW → APPROVED / REJECTED / ESCALATED / CLOSED. |
| Audit-sealed transitions | server.ts:280–365 | `intake.ticket.created`, `intake.recommendation.{approved,edited_approved,rejected,reassigned,manual_close,snoozed}`, `intake.ticket.escalated`, `intake.ticket.closed`. Chain-sealed by AuditLog trigger. |
| AI classification (real Claude) | [`routeToAgent()`](../modules/intake/src/agents/index.js) → `callClaudeJSON` → `/api/claude` | NDA, FAQ, Vendor, Contract Review, Trademark, Policy QA. Fallback templates on Claude error. |
| Recommendation records | `AgentRecommendation` (schema.prisma:1244) | agentId, confidence, suggestedAction, draftedResponse, status (PENDING/APPROVED/REJECTED/EDITED). |
| Copilot conversation | [`copilotTurn()`](../modules/intake/src/copilot/engine.js) + `IntakeConversation` table | Multi-turn intake; detects topic switches. |
| SLA computation | [`useTicketStore`](../modules/intake/src/hooks/use-ticket-store.js) | Elapsed-vs-slaHours → "On Track" / "At Risk" / "Overdue". **Client-side only**, every 30s. |
| Manual triage | `recordTriageAction` (use-ticket-store.js:65–89) | approved / rejected / reassigned / manual-close / snoozed / edited-approved. |
| AI Operations dashboard | `apps/web/src/views/ai-ops/` (PR #46) | Live agent activity, accuracy/coverage/review-time scorecard, pending-review queue. |

### 2.2 Mocked / placeholder

| Capability | Stub site | Notes |
|---|---|---|
| Prior NDA / sanctions lookup | [`agents/mocks.js`](../modules/intake/src/agents/mocks.js) | Hardcoded matches. No Refinitiv / OFAC. |
| Trademark search | [`trademark.js`](../modules/intake/src/agents/trademark.js) | `mock:true`. Deterministic regex; no USPTO. |
| Contract redline | [`contract-review.js`](../modules/intake/src/agents/contract-review.js) | "Full redline requires Contract Intelligence (v8.1)." Doesn't call Claude. |
| KB / policy library | [`agents/kb.js`](../modules/intake/src/agents/kb.js), [`policy-library.js`](../modules/intake/src/agents/policy-library.js) | 6 + 5 hardcoded entries. No vector search. |
| Similar-matter card | Referenced in `intake/index.jsx:8` — **file missing** | UI renders empty. |
| Attorney identity | `recordTriageAction` line 66 | Hardcoded `"You (Alex Nguyen)"`. Auth0 wired in Step 3 but intake never picks up the session. |

### 2.3 Missing entirely

| Capability | Why it matters |
|---|---|
| **Server-side SLA breach detection** | Client-only; `IntakeStatus.ESCALATED` is **never written** — the enum is dead code. |
| **Assignment as a typed FK** | `assignedTo` is a free-text string ("Cockpit Queue", "Rachel Adams"). No User FK, no "my queue" filter, no accountability join. |
| **Smart routing rules** | No `IntakeRoutingRule` schema. The GC can't say "any retaliation ticket pages me." Routing is hardcoded in `routeToAgent()`. |
| **Workflow stages enforced** | `IntakeTicket.workflowJson` is `[{label, done, active}]` — pure display. No per-type workflow definition. |
| **Matter spawn on approval** | `IntakeTicket.matterId` FK is nullable and never populated. |
| **Email / Slack ingestion** | `IntakeSource.{EMAIL,SLACK}` exist; no handlers. |
| **Notification fanout** | `Notification` table exists; intake never writes to it. |
| **Document upload** | Copilot is text-only. |

### 2.4 Surprises

- **Two parallel logs**: legacy `aegis:intake:agent-log:v1` localStorage mirror **and** canonical `AuditLog`. Drift inevitable until Step 5.
- **`IntakeStatus.ESCALATED` is dead.** The enum value exists; no path writes it.
- **Recommendation review status is a separate dimension** from ticket status. A ticket can be AWAITING_TRIAGE while its recommendation is APPROVED. UI conflates; PR #46 actually exposes this decoupling.
- **Sensitive employment matters deliberately get *lower* confidence** ([policy-qa.js:26](../modules/intake/src/agents/policy-qa.js)) so the AGENT escalates rather than auto-approving.

---

## 3. Mapping the GC's pain to capabilities

| Pain | Capability needed | Status today |
|---|---|---|
| "Hundreds of emails" not captured | Email → ticket ingestion | **MISSING** |
| "Missing key things" — signal lost | Triage + classification | **SHIPPED** for FORM/COPILOT (extends to email once that lands). |
| Doesn't know what's overdue | Server-side SLA breach + audit | **MISSING** (client-only). |
| Doesn't know who's working on what | Typed assignee (User FK) + my-queue view | **MISSING** (free-text). |
| Escalation guarantee | Routing rules + auto-escalation on breach | **MISSING** (manual reassign only). |
| Defensible "I delegated this" | Audit-sealed assignment + ack events | **PARTIAL** (reassignment audited; no ack event). |
| Multi-stage workflow | Enforced workflow per request type | **MISSING** (workflowJson is display data). |
| Reply / threading | Outbound mail + thread linkage | **MISSING**. |
| Cross-channel inbox | FORM ✓, COPILOT ✓, EMAIL ✗, SLACK ✗ | **PARTIAL** (2 of 4). |

The AI triage loop is already real. **The gaps are workflow primitives**:
assignment, SLA enforcement, escalation routing, multi-stage workflows.
None of them require new AI work. All of them require platform work.

---

## 4. M365 / Legal Hold / eDiscovery — what to freeze, what to keep

**Freeze (no new features):**

- Legal Hold UX (no 4c.6, no 4d for Hold).
- eDiscovery integrations.
- Hold scope templates, defensibility export, notice editor.

**Keep (infrastructure that Intake will reuse — but only at the end):**

- `M365GraphClient`, `withGraphAudit`, delegated OAuth, per-org
  `OrganizationM365Credential`, `/admin/m365`, `admin:m365:manage`.

**v2 change.** The original plan ingested email in Phase 2. That
front-loaded M365/Graph debugging onto the critical path, which the
operator wants to avoid. **Email ingestion now lands LAST** (see
§5.4), and it ships with a **stub-first** rollout so we can demo
the end-to-end NDA journey without any Graph dependency. The Graph
plumbing stays compiled and ready for when we wire it.

---

## 5. Proposed sequencing

### 5.0 The end-to-end demo spine — the contract for "productionized"

Every phase below succeeds or fails against **one demo journey**.
If this journey works on real persisted data, audit-sealed, against
real users, on the existing UI surfaces — the GC's problem is solved
for forms/Copilot, and email is just one more channel feeding the
same engine.

> **The NDA request journey.**
>
> 1. **Self-service** — Alex (Sales, employee@acme) opens AEGIS →
>    *New Request* → "NDA with vendor Initech, mutual, 3 yr." OR
>    drives the same intake through Copilot chat.
>    `IntakeTicket.requesterId` resolves to Alex's `Person` row via
>    the Auth0 session — **not** the seeded demo user.
> 2. **AI classification** — `routeToAgent()` selects `NDAAgent`.
>    Real Claude call (or fallback template). `AgentRecommendation`
>    row created with `confidence: 0.92`, `suggestedAction:
>    "approve-and-send"`. **Writes an `AgentDecision` row in PENDING**
>    — the 4b-locked schema goes live as the human-approval gate.
> 3. **Smart routing** — `IntakeRoutingRule` fires: "NDA from Sales
>    → assign Rachel Adams". `IntakeTicket.assignedToUserId` is a
>    real `User` FK. `intake.ticket.assigned` audit event.
> 4. **Kanban + Inbox** — Ticket appears in Rachel's *My Queue*
>    filter on the Inbox, and in the "In Review" lane of the Kanban
>    under Rachel's swimlane. Both surfaces respect the new typed
>    assignee.
> 5. **SLA timer** — `evaluateSlaBreaches` is running server-side
>    (admin trigger or pg-boss). Currently "On Track" (24h SLA,
>    ticket is 2h old).
> 6. **Triage Cockpit** — Rachel opens the Cockpit, sees the rec,
>    presses **A** to approve. `AgentDecision` flips to APPROVED;
>    only then does `intake.recommendation.approved` fire, gated by
>    the AgentDecision lifecycle.
> 7. **Workflow advance** — `IntakeTicket.stage` transitions
>    `triaged → reviewed → approved` per the `IntakeRequestType`
>    workflow definition; each transition writes
>    `intake.ticket.stage_advanced`.
> 8. **Optional Matter spawn** — if the request type's workflow
>    ends in `matter-creation`, `@aegis/matter.createMatter` runs
>    and `IntakeTicket.matterId` is populated. `intake.ticket
>    .matter_spawned` audit event.
> 9. **SLA Dashboard** — the GC's executive view shows: 1 approved
>    today, avg review time 4h, queue depth 7, 0 overdue, breach
>    forecast 0 in next 24h.
> 10. **Sad path** — if Rachel doesn't act in 24h, the SLA evaluator
>     fires `intake.ticket.sla_breached`, the auto-escalation routing
>     rule fires `intake.ticket.auto_escalated`, ticket flips to
>     `IntakeStatus.ESCALATED` (the dead enum value goes live), and
>     a notification fires to the GC.

This is the GC demo. P1–P3 below ship it.

---

### 5.1 Phase 1 — Productionize the foundation (3–4 PRs)

Make every existing UI surface work on real data, real users, real
audit. No new surfaces.

**P1a — Real session attribution (1 PR).**
- Remove the hardcoded `"You (Alex Nguyen)"` in
  [use-ticket-store.js:66](../modules/intake/src/hooks/use-ticket-store.js).
- Triage actions attribute to the Auth0-resolved User
  (`getResolvedUser` → audit `actorId`).
- New Request form attributes the requester to the session user's
  `Person` row (not the auto-create `p-auto-…` fallback when
  Auth0 is configured).
- Cockpit, Inbox, Kanban all show the real user.
- Audit-chain regression test: every intake mutation in the demo
  walks with a real `actorId`.

**P1b — Typed assignment (1 PR).**
- Add `IntakeTicket.assignedToUserId String?` alongside existing
  `assignedTo` (free-text stays during migration).
- Backfill migration: name → `User.findFirst({ name })` lookup,
  fall through to null.
- New audit action `intake.ticket.assigned` (before/after assignee
  pair).
- **Inbox**: "My Queue" filter chip (`assignedToUserId === me`).
- **Kanban**: swimlanes by `assignedToUserId`; drag-to-reassign
  is a real mutation with audit.
- Sunset: free-text `assignedTo` removed when callers migrated
  (target: end of P3).

**P1c — Server-side SLA breach + ESCALATED wired (1 PR).**
- Service `evaluateSlaBreaches(orgId)`: scans tickets where
  `now − submittedAt > slaHours·1h` AND status ∉ {CLOSED, REJECTED,
  ESCALATED}.
- Admin HTTP trigger `POST /api/admin/intake/jobs/sla-evaluate`
  (pg-boss-ready, mirrors the defensibility-snapshot pattern from
  4c.5).
- New audit actions `intake.ticket.sla_breached` and
  `intake.ticket.auto_escalated`.
- Server flips status to `IntakeStatus.ESCALATED` — wires the dead
  enum end-to-end.
- **SLA Dashboard**: "Overdue" tile + per-ticket breach indicator
  on the Inbox and Kanban.

**P1d — Unify the audit log surface (1 PR).**
- Kill the parallel `aegis:intake:agent-log:v1` localStorage mirror.
- The Cockpit's "Agent Activity" tab becomes a thin read over
  `AuditLog` (filtered to intake actions), with the actor-name
  resolver from sub-PR 4c.3 doing the user lookup.
- Removes the
  [Documented exceptions row #1 drift risk](../CLAUDE.md)
  ahead of Step 5.

**Phase 1 exit bar:** the demo spine §5.0 steps 1–6 + 10 work
end-to-end on a freshly seeded DB. The GC can file an NDA request,
watch it route to Rachel, see her approve it, and see the audit
chain on the canonical log.

---

### 5.2 Phase 2 — Smart routing + workflow primitives (2 PRs)

Where Intake becomes the **workflow engine**, not just an inbox.

**P2a — Smart routing rules (1 PR).**
- New schema `IntakeRoutingRule { orderIndex, conditionJson,
  actionJson }`.
- **Conditions** (composable): matchType, matchPriority,
  matchDepartment, matchKeyword, matchAgentSuggestedAction.
- **Actions**: setAssignee (resolved to User FK), setPriority,
  setSlaHours, escalateTo, requireApprovalFrom.
- `applyRoutingRules(ticket)` runs after creation + after
  classification. Each fired rule writes an audit row.
- Admin UI `/admin/intake/routing-rules` — CRUD, drag-to-reorder,
  test-against-sample-ticket affordance.
- Seeded examples: "NDA from Sales → Rachel", "retaliation
  keyword → page GC", "settlement >$1M → require GC approval",
  "vendor sanctions hit → escalate".
- The Cockpit shows **which rule fired** on each ticket — closes
  the "why was this assigned to me" question.

**P2b — Per-type workflow definitions + Matter spawn (1 PR).**
- New schema `IntakeRequestType { name, workflowJson, slaHours,
  requiredApprovals }` modeled after `MatterTypeConfig`.
- 6 seeded types: NDA, Contract Review, Vendor Onboarding,
  Trademark, Policy Question, Employment Concern.
- Workflow stages enforced server-side: a ticket can't skip
  `triage → approval`. New audit action
  `intake.ticket.stage_advanced`.
- **AgentDecision lifecycle goes live.** Every Claude recommendation
  writes an `AgentDecision` row in PENDING. The Cockpit's
  approve/reject keystrokes are the only thing that flips it to
  APPROVED. Downstream mutations (stage advance, notice, matter
  spawn) gate on APPROVED status — the 4b-locked contract finally
  starts checking.
- Approving a workflow that ends in `matter-creation` calls
  `@aegis/matter.createMatter`; `IntakeTicket.matterId` is
  populated; `intake.ticket.matter_spawned` audit.

**Phase 2 exit bar:** demo spine §5.0 steps 7–8 work. The routing
rule is visible in the Cockpit, the stage progression is enforced,
and an approved NDA spawns a Matter visible in
[`/matter/[id]`](../apps/web/pages/matter/).

---

### 5.3 Phase 3 — SLA Operations dashboard (1 PR)

Promote the AI Ops scorecard (PR #46) into a richer **SLA
Operations** surface. Single executive-facing dashboard,
mounted on Mission Control alongside the existing section.

- **Queue health** — total open, by stage, by request type, by
  assignee. Real counts over real data.
- **Breach forecast** — tickets where `slaHours − elapsed < 4h`
  AND status ∉ terminal. The "imminent escalation" view.
- **Attorney workload** — tickets per assignee, average time to
  triage, % of recommendations accepted (per-attorney accuracy).
- **Routing-rule effectiveness** — fires per rule, downstream
  approval rate per rule. Catches a stale rule that's mis-routing.
- **Trend sparklines** — daily queue depth, daily breach rate,
  reusing the `Sparkline` primitive from 4c.5.

No new mutations. Pure read aggregation, gated on
`audit:read_all` OR `intake:read_all_tickets` (same as PR #46's
existing route).

**Phase 3 exit bar:** GC can open Mission Control and answer in
under 10 seconds: "What's overdue? Who's overloaded? What's about
to breach?"

---

### 5.4 Phase 4 — Email channel (last; stub-first) (2 PRs)

Lands ONLY after Phases 1–3 are demo-solid. Stub-first keeps
Graph debugging off the critical path.

**P4a — Inbound email webhook (stub) (1 PR).**
- New endpoint `POST /api/intake/email-webhook` accepting a JSON
  payload `{ from, subject, body, threadId, attachments? }`.
- Adapter creates an `IntakeTicket` with `source: EMAIL`,
  requester resolved by email lookup (auto-create person if
  unknown).
- Existing classifier + smart routing fires automatically — same
  pipeline as FORM/COPILOT.
- **No Graph dependency.** Demoable by curl-ing the endpoint, or
  via a Postman collection, or via a tiny test script. The point
  is to prove the **adapter layer works** before plugging Graph
  into it.

**P4b — Real M365 Graph polling (1 PR, do last).**
- New schema `IntakeEmailMailbox { orgId, mailbox, lastPolledAt,
  filterRulesJson }`.
- `pollMailboxForIntake(orgId, mailboxId)` calls Graph
  `/users/{mailbox}/messages?$filter=receivedDateTime gt
  {lastPolledAt}`. Reuses `M365GraphDelegatedClient` from sub-PR
  4c.1 — same service account, same `admin:m365:manage`
  permission.
- Each message → POST to the P4a webhook (or direct invocation
  of the adapter — same code path).
- Admin HTTP trigger; pg-boss-ready service shape.
- Outbound reply via Graph `/sendMail` with In-Reply-To threading
  (or stubbed for the demo if needed).

**Phase 4 exit bar:** GC forwards an email to `legal-intake@…`,
30 seconds later it's in the Cockpit, classified, routed, audit-
sealed — same journey as the form/Copilot demo, just a different
source.

---

### 5.5 Phase 5 — Step 5 refactor (the original PR #5, deferred)

After Phases 1–4 ship, do the Intake module's `internal/api`
split from the original foundation plan
([CLAUDE.md Foundation plan, PR #5](../CLAUDE.md)). Now there's a
real surface and a real internal layer to split — not a demo
prototype.

The seed-script cross-package import exception
([Documented exceptions row 1](../CLAUDE.md#documented-exceptions-to-the-module-isolation-rule))
sunsets here as originally planned.

---

## 6. What this proposal does NOT do

- **No 12th module.**
- **No Matter / Legal Hold rename or split.**
- **No replacement of the Claude classifier.**
- **No new audit chain.** Every new mutation in P1–P4 uses
  `logAudit()` — chain stays intact.
- **No PRODUCT.md change.** 11-module roster preserved.
- **No new `Contact` / `Counterparty` per channel.** Email From:
  resolves to `Person` (existing shared entity).

---

## 7. Open questions for the operator

These need a call before Phase 0 lands as the CLAUDE.md edit:

1. **AgentDecision lifecycle activation timing.** The locked-but-
   empty `AgentDecision` schema from 4b can go live in **P1b**
   (with typed assignment, so the gate runs on every routed
   ticket) or **P2b** (with workflow primitives). My recommendation:
   **P2b** — gates make most sense once stage transitions exist
   to gate against. Document the deferral in the
   `MockHoldAIClient` exception row that already references
   AgentDecision.
2. **Mock retention.** Trademark / sanctions / KB stubs in
   `agents/mocks.js` are demo-fine, ship-blockers for the first
   paying customer. Are they a P5 problem or do they get a
   dedicated "Intake productionization" sub-effort before P4?
3. **Step 5 timing.** Confirm P5 is genuinely after P4, not
   parallel. Splitting Intake's internal/api surface while three
   new schema models are landing is high-risk.

(Removed from v1: the mailbox-addressing question — deferred until
P4b.)

---

## 8. If you approve this direction

**Phase 0** lands as one PR that:
- Edits CLAUDE.md Foundation plan with the reordered sequence
  (P1 productionize → P2 workflow + routing → P3 SLA dashboard →
  P4 email last → P5 Step 5 refactor).
- Adds a "Documented exceptions" row codifying the M365 feature-
  freeze with the infra-preserve carve-out and a sunset
  ("Phase 4b complete").
- Links to this document.
- Adds nothing else.

**Phase 1a** starts immediately after Phase 0 lands.
