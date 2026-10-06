# AEGIS manual test checklist

The automated suite (`pnpm --filter @aegis/web test:e2e`) proves every feature
**renders and responds**. A handful of things a script can't judge — whether an
AI answer is actually good, whether a flow *feels* right in a demo — belong
here. Run this after the automated suite is green, ideally against a seeded test
instance (not the live demo).

Tick each item; note anything that feels off.

## ONE Legal (the front door)

- [ ] **Ask a question** — type *"What's our standard NDA term length?"* and hit Route. The answer should be specific, grounded, and cite/offer to open relevant docs — not a generic essay.
- [ ] **File a request in natural language** — *"Create a mutual NDA for Acme Corp, 2-year term, Delaware law."* It should produce a **Proposed action · needs your approval** card (not act on its own) and, on approve, file a ticket with the right fields pre-filled.
- [ ] **Governance gate holds** — confirm no AI action mutates state without the approve step. Reject one and confirm nothing was created.
- [ ] **Deep skill review** — run *"Review a third-party MSA from Deloitte"*; the clause findings should be plausible and map to the playbook.
- [ ] **Draft canvas** — ask it to draft a memo; edit the title/content, regenerate, and export to Word. The .docx should open cleanly.
- [ ] **Research across documents / the law** — the two research chips should return results that are relevant to the seeded corpus, with sources.
- [ ] **Feel** — does the front door feel like "one place to ask or file"? Any dead ends, confusing empty states, or jarring latency?

## Legal Intake

- [ ] **Triage Cockpit** — open a ticket; the AI triage recommendation (route, priority, suggested action) should be sensible for the request text.
- [ ] **Approve / Edit / Reject keyboard shortcuts** — they should work and each should write an audit entry (check Audit Log / Activity).
- [ ] **New Request → both paths** — the structured form *and* the Copilot chat should each produce a filed, persisted ticket that shows up in the Inbox/My Requests.
- [ ] **Classification quality** — file 3–4 varied requests (NDA, vendor DD, privacy question, litigation) and confirm each is classified + routed to a reasonable owner/queue.
- [ ] **SLA Dashboard** — breach/at-risk indicators should match the tickets' due dates.
- [ ] **Smart Routing** — if routing rules exist, confirm the cockpit shows which rule fired and it matches the rule's conditions.
- [ ] **Self-Service** — the requester-facing view should be usable by a non-staff role (try `DEV_USER_EMAIL=<a requester>` in dev).

## Contracts

- [ ] **Repository accuracy** — KPI tiles (Total / Active / In flight / High risk / Expiring 90d / Obligations) should reconcile with the table.
- [ ] **Lifecycle pipeline** — clicking a stage should filter to contracts in that stage.
- [ ] **Draft with AI** — generate a contract from a template; the output should be coherent and use the right clauses.
- [ ] **Review 3rd-party** — upload/point at a third-party paper; the risk flags and clause deviations should be meaningful.
- [ ] **Contract detail** — open a row; obligations, key dates, and the integrity/audit tab should all populate and look right.
- [ ] **Renewals / Key Dates** — upcoming dates should be correct and sorted sensibly.

## Cross-cutting

- [ ] **Audit chain** — every approval / mutation you did above shows an entry in the Audit Log; nothing is missing.
- [ ] **Role lenses** — switch `DEV_USER_EMAIL` to a non-admin role and confirm nav + actions hide/show correctly and gated APIs refuse.
- [ ] **No console errors** — open dev tools during a walkthrough; no uncaught errors or failed `/api/*` calls on the happy path.
- [ ] **Demo spine ("the NDA request journey")** — walk the full path once end-to-end (request filed → triaged → routed → contract drafted) and confirm it hangs together.

---

**When reporting back:** attach `e2e-report/summary.md` for the automated
results, and note any ❌ or "feels off" items from this checklist.
