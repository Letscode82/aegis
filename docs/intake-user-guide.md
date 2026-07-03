# AEGIS Legal Intake — User Guide

*How your organization files, works, and tracks legal requests in one place.*

This guide is for everyone who touches AEGIS Intake: employees who need
something from Legal, the legal team working the queue, managers
watching the operation, and the administrators who configure it. Find
your section and start there — nothing here requires training beyond
reading your part.

Version 1.0 · July 2026

---

## 1 · What AEGIS Intake is

AEGIS Intake is the single front door to your legal department. Every
request — an NDA, a contract review, a trademark question, a vendor
check, a lawsuit notice — comes in through one system, no matter how it
was sent (web form, chat assistant, Microsoft Teams, or email). The
moment a request arrives:

1. **AI reads it** — classifies the type, urgency, and risk, and often
   drafts a first response for the legal team.
2. **Rules route it** — to the right person or team, with the right
   deadline (SLA) attached.
3. **Everyone can see it** — the requester tracks progress without
   emailing anyone; the legal team works from one queue; managers see
   the whole operation live.
4. **Everything is recorded** — every action lands on a tamper-evident
   audit ledger. Nothing happens off the books.

One important principle throughout: **AI never acts alone.** It
suggests, drafts, and routes — but a human on the legal team approves
every outcome. That approval is enforced by the system, not by policy
memo.

---

## 2 · Signing in

Open the AEGIS link your administrator shared and sign in with your
normal work account (if single sign-on is set up, that's your
Microsoft login — your usual password and MFA).

What you see depends on your role:

| You are… | You see… |
|---|---|
| An employee (requester) | **New Request · My Requests · Self-Service** — just what you need |
| Legal staff (attorney / paralegal) | The work surfaces: **My Work, Inbox, Triage Cockpit, Kanban**, plus filing and insight tabs |
| Legal ops / GC | Everything staff sees plus **SLA Dashboard** and **Pool Ops** |
| Administrator | Everything, plus **Teams** and **Request Types** configuration |

If it's your first time and your company uses SSO, an account may be
created for you automatically the first time you sign in — you'll land
on the requester view.

---

## 3 · For employees — getting legal help

### 3.1 Before you file: Self-Service

Click **Self-Service** first. It contains answers to the most common
questions (NDA basics, policy questions, "can I sign this?"). If an
article answers you — done, no waiting. If not, every article has a
button to file a request with the context pre-filled.

### 3.2 Filing a request (the form)

1. **New Request** tab.
2. Your name is pre-filled from your login. Pick your **department**
   and **urgency** (be honest — "Emergency — deal blocker" makes it a
   Critical-priority ticket and pages senior attention).
3. Pick the **request type**. Types marked **▣** are your legal team's
   configured workstreams — picking one may reveal a few extra fields
   (e.g. counterparty name, contract value). Fields marked * are
   required.
4. **Describe what you need.** Be specific — the AI reads this to
   classify and route your request. As you type, you'll see a live
   preview of how it's being understood.
5. **Attach a document** if you have one (Word, PDF, or text — e.g.
   the contract you want reviewed). The system extracts the text so
   the legal AI actually reads your document, not just your summary.
6. **Submit.** You'll immediately see your ticket number, what the AI
   made of it, and where it went. Click **Track it** to follow along.

### 3.3 Filing by chat (the Copilot)

Prefer a conversation? The **Intake Copilot** interviews you: what do
you need, with whom, by when. It fills the form for you and files when
you confirm. If you drift onto a different topic mid-conversation, it
notices and offers to switch.

### 3.4 Filing from Microsoft Teams

If your admin has connected Teams, you never have to leave your
channel:

| Type in Teams | What happens |
|---|---|
| `@AEGIS We need a mutual NDA with Acme Robotics before the pilot` | Files a ticket; AEGIS replies in-channel with the ticket number, priority, and deadline |
| `@AEGIS status REQ-1234` | Replies with that ticket's current status and owner |
| `@AEGIS status` | Lists your recent tickets |
| `@AEGIS help` | Shows these commands |

### 3.5 Filing by email

If the email channel is connected, mailing your legal intake address
creates a ticket automatically — subject becomes the headline, body
becomes the description, and attachments are noted. You'll be
identified by your email address.

### 3.6 Tracking your requests

**My Requests** is your portal:

- Every request you've filed, newest first, each with a plain-language
  latest update ("Assigned", "Moved forward", "Closed by legal").
- Click any request to see its full detail and timeline.
- Toggle **show closed** to see history.

You'll also get **email notifications** when your request moves a
stage and when it's resolved (your legal team controls whether email
delivery is switched on).

**What you never have to do:** email an attorney to ask "any update?".
The status you see is the real status.

---

## 4 · For legal staff — working the queue

### 4.1 Start your day in My Work

**My Work** is your personal inbox, in priority order:

- **Reviews waiting on you** — AI recommendations pending your verdict.
- **Your tickets** — assigned to you or handed to you, overdue first,
  then by priority, then oldest.
- **Your open tasks** — sub-tasks assigned to you across tickets.

Click anything to jump straight to it.

### 4.2 The Triage Cockpit — decide in seconds

The Cockpit shows **one ticket at a time** with the AI's recommendation
front and center: the drafted response, the reasoning, the confidence,
and any concerns. Your job is a verdict, and it's keyboard-first:

| Key | Action |
|---|---|
| `a` | **Approve** — send the AI's draft as-is |
| `e` | **Edit, then approve** — fix the draft first |
| `x` | **Reject** — send to manual handling |
| `r` | **Reassign** — pick a colleague |
| `s` | **Snooze** — deal with it later |
| `j` / `k` | Next / previous ticket |
| `b` | Bulk-select for approve-many |
| `?` | Show all shortcuts |

Three things happen automatically on approve:

1. Your identity is recorded as the approver (the system uses your
   login, not what the screen claims).
2. The AI's recommendation record is marked approved — this is the
   governance gate; nothing AI-suggested takes effect without this.
3. If the request type warrants it (e.g. an NDA), a **Matter is
   created automatically** in the matter system and linked — you'll
   see it in the confirmation toast.

**Approval gates:** some tickets show a **🔒 APPROVAL** badge naming a
specific person (set by a routing rule — e.g. "all M&A drafts need the
GC"). Only that person's approve will stick; anyone else's is refused
and recorded. Rejecting or reassigning is never gated — anyone can
flag a problem.

### 4.3 The ticket page — everything in one place

Open any ticket (from Inbox, My Work, or Kanban) to see:

- **Header** — priority, type, status, who holds it right now
  (🤖 with the AI, a named person, or in queue), any approval gate,
  and the live SLA clock.
- **Structured details** — the answers the requester gave to your
  configured fields.
- **Workflow strip** — the stages this request moves through, with
  **Advance Stage** to move it (the system records who and when).
- **SLA Custody Legs** — the deadline clock, split by who held the
  ticket for how long. If a deadline was missed, the segment that was
  holding it when the clock ran out is flagged — a hand-off can't hide
  a breach.
- **Ticket Timeline** — the complete story: filed, routed, drafted,
  handed off, advanced, notified, decided — every entry stamped onto
  the tamper-evident ledger.
- **AI Triage panel** — category, risk, estimated effort, and a
  complexity tag (SIMPLE / STANDARD / COMPLEX).

### 4.4 Delivering the work

On the ticket's **Work panel**:

- Set the **delivery status** (Not started / In progress / Blocked /
  Delivered) — separate from the triage status, this is "how is the
  actual work going".
- Add **assignments** (lead, reviewer, support) and **sub-tasks**;
  click a task's chip to advance it.
- **Log your time** with one click — **+15m / +30m / +1h** on any
  task. No timesheet ceremony; the minutes roll up into management's
  utilization view automatically.

On the **Parties panel**:

- Record who's involved — counterparties, opposing counsel, witnesses.
  (Litigation tickets arrive with parties pre-extracted by the AI.)
- Click **⚖ Conflicts** on any party for an instant answer to *"have
  we ever dealt with this entity?"* — every past ticket **and** every
  matter involving them, across the whole platform. The check itself
  is recorded on the ledger (that's evidence, too).

### 4.5 Passing work around

- **Reassign** (`r` in the Cockpit) moves ownership.
- **⇄ Hand off** passes the baton explicitly — to a person, back to
  the AI, or to the queue — with a reason. The ticket's custody chain
  updates, and the SLA legs view shows exactly who had it when.
- When the AI first processes a ticket, it records its own hand-offs
  automatically (queue → AI → you). Nobody has to remember to log it.

### 4.6 The Kanban board

Prefer a board? **Kanban** shows every active ticket by stage — drag
cards between columns; the change is real (persisted, recorded), not
cosmetic.

---

## 5 · For managers — running the operation

### 5.1 SLA Dashboard

The health of the queue at a glance: open volume, awaiting triage,
escalations, overdue and at-risk counts, per-attorney workload, and
which routing rules are actually firing (and when they last did).

### 5.2 Pool Ops

If you've organized the team into tiers/pools (see §6.3), **Pool Ops**
is your capacity view:

- **Utilization per person and per pool** — open items against
  capacity, color-coded (green < 70 %, amber ≥ 70 %, red ≥ 100 %).
- **Complexity mix** — is Tier 1 really only getting the simple work?
- **Overflow events** — how often work spilled to the next tier
  because a pool was full (your hiring/capacity signal).
- **Throughput** — items closed per tier (7-day and 30-day) and
  **effort hours logged** per tier.

This is the "senior counsel freed for strategic work" evidence, live.

### 5.3 Escalations & SLA enforcement

- Routing rules can escalate automatically (e.g. any Litigation Notice
  → straight to the GC at Critical priority, marked Escalated).
- The **SLA breach scan** (scheduled, or run by an admin) escalates
  anything past its deadline and notifies the assignee. Every breach
  is recorded — the custody view shows who was holding the ticket
  when it breached.

### 5.4 The audit ledger

**Audit Log** (admins and GC) is the complete, cryptographically
chained record of everything: every filing, routing decision, AI
recommendation, human verdict, hand-off, notification, and conflict
check — who, when, before/after. It cannot be edited or deleted, by
anyone, and its integrity can be verified on demand. This is your
defensibility story in one screen.

---

## 6 · For administrators — configuring without code

### 6.1 Request Types (your workstreams)

**Request Types** tab → **+ New type**. Give it a name, a workstream
label, and its **stages** (e.g. Intake, Search, Opinion, Filed). Then
click **▸ Edit fields** to define what the form asks for that type —
text, dropdowns, dates, numbers, yes/no — and which are required.

The moment you save, the type appears on every employee's New Request
form with your fields and your workflow. Ten contract subtypes = ten
configurations, zero development.

### 6.2 Smart Routing rules

**Smart Routing** tab → **+ New rule**. A rule is *when* + *then*:

**When (conditions — all must match):** request type · priority ·
department contains · keyword in description · AI complexity
(simple/standard/complex).

**Then (actions — any combination):**
- assign to a person, or **route to a pool** (load-balanced),
- set priority · set the SLA deadline,
- **escalate to** someone (assign + raise to Critical + mark Escalated),
- **require approval from** someone (locks the final approve to them).

Examples that work well:
- *NDA Request → SLA 8h, route to Tier 1 pool.*
- *Complexity = complex → assign to senior counsel.*
- *Litigation Notice → escalate to the GC.*
- *Keyword "acquisition" → require approval from the GC.*

Every rule firing is recorded on the ticket and counted on the SLA
dashboard, so you can see which rules earn their keep. Rules never
override a human decision — once an attorney has acted on a ticket,
rules leave it alone.

### 6.3 Teams (pools & tiers)

**Teams** tab → create pools (e.g. *Tier 1 · Paralegals*, *Tier 2 ·
Counsel*), add members with a **capacity** (max open items; 0 =
unlimited), pick a strategy (**least-loaded** or **round-robin**), and
chain an **overflow** pool for when everyone is full. Point routing
rules at pools and the system balances the work.

### 6.4 Notifications

Each user controls their own email notifications (⚙ panel → 🔔):
master switch plus per-event toggles (assigned to me / my request
moved / SLA breach / resolved). Delivery uses your organization's
intake mailbox; until one is connected, notifications are recorded on
the ticket timeline but not emailed — the system is always honest
about which.

### 6.5 Users & access

Users and roles are managed in the platform's Admin area. With SSO
enabled, first-time colleagues from your approved email domain are
provisioned automatically as requesters; you promote roles from there.
Suspended users cannot sign in, but their history remains intact.

### 6.6 The AI agents

⚙ **Agents** panel: switch individual agents on/off, see today's
activity, and per-agent quality stats (how often attorneys accept
their recommendations). Two rules are built into the product and
cannot be turned off: **agents never auto-close tickets**, and **no
AI recommendation takes effect without a named human's approval**.

---

## 7 · Frequently asked questions

**I filed something urgent — how do I make sure Legal sees it fast?**
Set urgency to *Emergency — deal blocker* when filing. That makes the
ticket Critical immediately; routing rules typically escalate
Criticals to senior staff.

**Can I attach a big contract?** Yes — Word, PDF, or text. The size
limit is shown next to the attach button (up to 25 MB when large-file
storage is enabled; the original file is retained).

**Who can see my request?** You, and the legal team. Other employees
cannot see your requests.

**The AI drafted something wrong — is that a problem?** No draft goes
anywhere without an attorney approving it. Wrong drafts get edited or
rejected — and every rejection teaches the team where the AI needs
tuning (visible in the agent stats).

**Why can't I approve this ticket?** It carries an approval gate (🔒
badge) naming the only person who can approve it. You can still
reject, comment, or reassign.

**I work on my phone a lot.** Filing and tracking are fully
phone-friendly. The staff surfaces are designed for tablet and up.

**Something looks broken.** If a panel shows a "contained" error card,
click Retry — the rest of the app keeps working, and the error has
already been reported to your administrators automatically.

**Is any of this off the record?** No. Every action by every person —
and every AI — is on the tamper-evident audit ledger, verifiable on
demand. That's a feature: it's your defensibility.
