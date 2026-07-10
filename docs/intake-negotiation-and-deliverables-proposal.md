# Proposal — Inbox ingestion, 3rd-party negotiation workflow, and Word-doc deliverables

> **Status: SUGGESTION / design only — nothing built yet.** Requested
> relook at the best end-to-end intake→negotiation→signature flow
> (with counterparty/3rd-party touchpoints for NDA & CLM) and how
> agents should produce real Word-document deliverables (redlines,
> trademark reports). Grounded in what AEGIS already has so each piece
> is an *extension*, not a rebuild.

---

## 1. Legal inbox ingestion — recommended: webhook-primary, poll-fallback

Neither poll nor webhook alone is "best"; the robust pattern is
**both**, with webhook as the fast path and polling as the safety net.

| | Webhook (Graph change notifications) | Polling (`/messages` delta) |
|---|---|---|
| Latency | seconds | your interval (1–5 min) |
| Reliability | subscriptions **expire** (~3 days) + can miss events | never misses; catches up |
| Complexity | subscription lifecycle + renewal + validation | simple loop |

**Recommendation:**
1. **Webhook first** — a Microsoft Graph *subscription* on the shared
   Legal mailbox (`/users/{legal-inbox}/messages`) posts to
   `POST /api/intake/email-webhook`. Low latency; this is the demo-able
   path AEGIS already scaffolds (P4a adapter is M365-independent — you
   can curl it today).
2. **Polling as reconciliation** — `pollMailboxForIntake` (P4b, Graph
   delta) runs every few minutes to catch anything the webhook missed
   or that arrived while a subscription was expired. Idempotent, so it
   never double-creates.
3. **Subscription renewal job** — a scheduled task re-ups the Graph
   subscription before it expires (same admin-trigger pattern as the
   defensibility-snapshot jobs until a worker runtime ships).

**Two things that matter more than poll-vs-webhook:**
- **Idempotency** — dedupe on `internetMessageId`; one email = one
  ticket even if webhook + poll both see it.
- **Threading** — a reply from the counterparty must attach to the
  **existing** ticket, not spawn a new one. Key on
  `conversationId` / `In-Reply-To` so the whole negotiation lives on
  one ticket/matter. **This is the linchpin for the negotiation flow
  below.**

---

## 2. The best NDA / CLM workflow — with the counterparty as a first-class actor

Today's engine models **HUMAN** and **AGENT** steps with roles, SLAs,
and skip rules. Negotiation needs two things it doesn't have yet: a
step where the ball is **with the other side**, and **rounds** (the
draft↔redline loop). Proposed engine extensions:

### 2a. New step kind: `EXTERNAL` (waiting on a 3rd party)
An `EXTERNAL` step means "we've sent it out; we're waiting." It:
- sends an email (via the existing notification/M365 send path) with
  the current draft + a **secure scoped link** (reuse the
  custodian-portal / `external_counsel` pattern — a magic-link portal,
  no account needed) where the counterparty can view, download the
  `.docx`, and **upload their redlined version**;
- tracks its own sub-state: `sent → awaiting → received`;
- runs an SLA with **reminders/escalation** (chase the counterparty);
- **advances automatically when the reply threads back in** (§1
  threading) — the inbound redline attaches to the ticket and moves
  the ladder to the next step.

### 2b. Negotiation **rounds** (a bounded loop)
Add a `round` counter to the instance and a "loop back to step N until
`context.status == 'agreed'`" construct (a disciplined superset of the
existing send-back). Each round stores its own artifacts (the sent
draft, the returned redline, the agent's diff analysis) so the full
negotiation history is reconstructable and defensible.

### 2c. The ladder (seed this as `nda_negotiation` / `clm_negotiation`)

```
1. Intake & classify                (AGENT)   — auto from email/upload
2. First-pass review + redline       (AGENT)   — deliverable: marked-up draft + issues memo (§3)
3. Internal position approval        (HUMAN · attorney)
4. Send to counterparty              (EXTERNAL) — email + secure link, SLA + reminders
5. Await counterparty redlines       (EXTERNAL) — reply threads back → advance
6. Analyse returned redlines         (AGENT)   — deliverable: deviation report vs playbook
7. Internal decision                 (HUMAN · attorney/GC by value·risk band)
        ├── accept  → step 9
        ├── counter → round++, back to step 4
        └── escalate→ GC / senior counsel
8. (loop 4→7 per round, capped e.g. 5)
9. Final approval                    (HUMAN · GC at threshold)
10. E-signature                      (EXTERNAL/HUMAN) — DocuSign/Adobe/native
11. Executed → obligations extracted → repository + matter link
```

CLM is the same spine with more approval bands and clause-library
depth (your Contract-Type Specialist already carries per-type
playbooks). NDAs are the fast lane (fewer rounds, lower bands).

### 2d. Governance stays intact
Every agent output is a **DRAFT** — the `AgentDecision` gate means
nothing reaches the counterparty until a human approves the *send*
step. Each round, each send, each signature is a chain-sealed audit
row. The counterparty portal is scope-limited (they see only their
document + the fields they need), mirroring the custodian portal's
permission model.

---

## 3. Agent deliverables — real Word documents

Today agents return a `draftedResponse` (text) + concerns. The ask is
a **document**: a redlined `.docx`, a trademark report, etc. Here's the
honest build path — what's straightforward vs genuinely hard.

### 3a. The pipeline (new capability in `@aegis/documents`)
- Agents emit **structured output** (issues, proposed clause text,
  search hits, risk rating) — not just prose.
- A new `renderDeliverable(kind, structuredOutput)` service turns that
  into a `.docx` using a Word-generation library (e.g. the `docx` npm
  package or a docxtemplater template), stored via the existing Vercel
  Blob upload path and attached to the ticket as a `Document`.
- The Cockpit shows a **"Download deliverable (.docx)"** button next to
  the recommendation; the counterparty gets it via the portal.

### 3b. NDA / contract redline — pragmatic v1 → true v2
- **Hard truth:** real Word **tracked-changes** on an arbitrary
  uploaded contract means editing OOXML `w:ins`/`w:del` runs inside
  *their* document structure — non-trivial and error-prone.
- **v1 (ship first):** the agent produces (a) a **clean revised
  draft** `.docx` from our template with the playbook-compliant
  clauses, and (b) an **issues/change memo** `.docx` — "clause X
  deviates → propose Y, because Z" — ordered ACCEPT/NEGOTIATE/REJECT.
  This is genuinely useful and fully doable now.
- **v2 (fast-follow):** true **tracked-changes redline** — diff the
  counterparty's clauses against our position and inject
  tracked-change runs into a copy of *their* `.docx`. Options: an
  OOXML redline library, or a specialised redlining API. Scope this as
  its own project; don't gate v1 on it.

### 3c. Trademark — "all the steps + a Word report"
- **Hard truth:** a real clearance search hits external registries
  (USPTO TSDR/TESS, EUIPO, WIPO Madrid Monitor) — external APIs, rate
  limits, and licensing. The agent today deliberately disclaims it is
  *not* a registry search.
- **v1:** the agent produces a **structured clearance-report `.docx`**:
  mark, NICE classes, jurisdictions in scope, the checks it *can* run,
  a risk rating, and clearly-flagged **"formal registry search
  pending"** sections — a real report scaffold, honest about coverage.
- **v2:** wire the registry APIs so the report is populated with
  actual identical/similar hits per class/jurisdiction, common-law
  notes, and a defensible recommendation. Same report shape; the
  "pending" sections fill in.

### 3d. Same pattern for the others
Notice agent → a `.docx` situation brief + cited-deadline schedule.
Privacy → a DPIA-style assessment `.docx` with the gaps list. Vendor →
a due-diligence memo. Every agent's structured output already exists
(risks, playbook, concerns) — the deliverable service just renders it.

---

## 4. Suggested sequencing (when you say go)

1. **Threading + idempotency hardening** on the email channel — the
   prerequisite for replies attaching to one ticket. (Small, high
   leverage.)
2. **`EXTERNAL` step kind + secure counterparty portal** — the
   3rd-party touchpoint. (Reuses the custodian-portal pattern.)
3. **Negotiation rounds** in the engine + seed the `nda_negotiation`
   ladder. (Demo the full NDA journey with a real "other side".)
4. **`renderDeliverable` service** + NDA change-memo/clean-draft `.docx`
   and the trademark report scaffold (v1 deliverables).
5. **Webhook subscription + renewal job** (upgrade ingestion latency).
6. **v2 deliverables** — true tracked-changes redline; real registry
   search — each its own project.

Each is one or a few PRs, demo-green at every checkpoint, same loop as
the workflow program.

---

## 5. What stays true throughout
- **Human-gated:** no agent output reaches a 3rd party without an
  approved send step. Conservative-AI governance is the product.
- **One brain:** the counterparty, the redlines, the obligations, and
  the audit all attach to the same shared entities — the negotiation
  history is one queryable record, not scattered email.
- **Chain-sealed audit:** every round, send, and signature is provable
  — the defensibility no point tool (Ironclad, DocuSign CLM, a mailbox)
  gives you end-to-end.
