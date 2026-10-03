---
name: corporate-board-minutes-resolutions
description: >-
  Drafts or reviews board / shareholder resolutions and minutes to the required standard: correct meeting mechanics
  (notice, quorum, conflicted-director recusal), the operative resolution wording, the authority and approvals a
  decision needs, and India's Secretarial Standards SS-1/SS-2 and Companies Act formalities. Use to paper a board or
  members' decision defensibly. Not for the broader governance health check → corporate/corporate-governance-review;
  not for the recurring filing calendar → corporate/entity-compliance-calendar.
module: corporate
version: 1.0.0
jurisdictions: [IN, global]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of draft (produce resolutions + minutes), review (assess a draft for validity/formalities) or authority-check (confirm what approvals a decision needs and who can pass it).
  - name: decision
    required: false
    description: The decision(s) to be recorded, the body (board / committee / shareholders), the meeting date and type, and any conflicted directors.
  - name: company
    required: false
    description: The entity type and governing law, its articles, the quorum/notice rules, and whether Secretarial Standards (SS-1/SS-2) apply.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [corporate/corporate-governance-review, corporate/entity-compliance-calendar, corporate/shareholder-agreement, corporate/listed-company-disclosure, corporate/fdi-fema-assessment]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Minutes & Resolutions Drafter

Takes a corporate decision and returns the resolutions and minutes that record it defensibly: the right meeting mechanics, the operative wording, the approvals the matter actually needs, and the statutory formalities (in India, Companies Act 2013 + SS-1/SS-2). The deliverable is a valid, audit-proof record, not prose that merely narrates the meeting.

## When to use / not use

- Use: drafting board/committee/shareholder resolutions and the minutes; reviewing a draft for validity and formality defects; confirming what approvals a decision needs (board vs shareholders vs special resolution) and who can pass it; papering a circular/written resolution.
- Hand off: the overall governance structure/charters/DoA review → `corporate/corporate-governance-review`; the statutory filing deadlines that follow the resolution → `corporate/entity-compliance-calendar`; shareholder-level rights behind the resolution → `corporate/shareholder-agreement`; a listed company's disclosure of the decision → `corporate/listed-company-disclosure`; FEMA/FDI approvals a resolution authorises → `corporate/fdi-fema-assessment`.

## Inputs to collect first

1. The **decision(s)** to record and the **body** passing them (board, committee, or members).
2. The **meeting type and date** (physical/video/circular), and the **articles / governing law**.
3. The **quorum, notice, and voting** requirements, and whether **Secretarial Standards SS-1 (board) / SS-2 (general meetings)** apply (Indian companies).
4. Any **conflicted/interested directors** and the matters requiring special majorities or members' approval.

## Method

1. **Confirm the right approval level first.** Map each decision to what the law/articles require: an ordinary board resolution, a matter reserved to members, an **ordinary vs special resolution**, or board + shareholder + regulator approval. Recording a members-reserved matter as a mere board resolution is invalid.
2. **Check meeting validity mechanics.** Proper **notice** (period, agenda, notes on items), **quorum** at the start and throughout, and the chair's authority. For circular/written resolutions, confirm they're permitted for that matter and passed by the required majority.
3. **Handle conflicted directors.** An interested director must **disclose** the interest and (generally) **not vote or count in quorum** on that item; record the disclosure and recusal explicitly — a vote tainted by an undisclosed interest can void the resolution.
4. **Draft the operative resolution precisely.** "RESOLVED THAT…" wording that is self-contained, states the action, the authority relied on, and any delegation/authorisation to named officers to execute — so a reader (bank, registrar, counterparty) can act on it alone.
5. **Minute to the standard, not verbatim.** Record attendance, quorum, the chair, declarations of interest, the decisions and dissents, and the key points of consideration — enough to show the decision was properly taken, without a transcript. In India, follow **SS-1/SS-2** on content, numbering, and signing/dating `[verify current]`.
6. **Capture authorisations and next steps.** Signatory authority, filings to be made, and who is to do what by when → `corporate/entity-compliance-calendar`.
7. **Finalise and maintain.** Draft minutes circulated and confirmed, signed and dated within the prescribed time, entered in the minute book, and the resolution filed where a form is required.
8. **Score against the Checks table** and set a verdict: **VALID / VALID WITH FIXES / INVALID (re-do)**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Wrong approval level (board vs members / special) | Each decision mapped to the required resolution | S1 | Re-route to the correct approval |
| Notice / agenda defective | Proper notice + item notes given | S2 | Re-issue notice or ratify properly |
| Quorum absent / lost mid-meeting | Quorum present throughout | S1 | Re-convene; the decision is otherwise void |
| Interested director voted / counted | Disclosure + recusal recorded | S1 | Re-take the vote without the conflict |
| Resolution wording not self-contained | Operative "RESOLVED THAT" + authority + delegation | S2 | Redraft the operative text |
| Minutes narrate instead of record decisions | Decisions, dissents, declarations captured | S2 | Rewrite to the record standard |
| SS-1/SS-2 formalities missed (India) | Content/numbering/signing per the Standards | S2 | Conform to the Standards `[verify current]` |
| Circular resolution used where impermissible | Matter eligible for written resolution | S2 | Convene a meeting instead |
| Signing/dating/minute-book upkeep missed | Signed, dated, entered within the time limit | S3 | Complete the formalities |

## Output

Lead with `Verdict: VALID | VALID WITH FIXES | INVALID — <decision> — <key reason>`. Then the output contract. Add:

- **Approval map**: each decision → required resolution level + any members'/regulator approval.
- **Validity**: notice · quorum · conflict handling · voting.
- **Resolutions**: the operative "RESOLVED THAT" wording + authorisations.
- **Minutes**: the record skeleton to the applicable standard.
- One JSON finding per defect with `category: "minutes-resolutions"`.

## Edge cases & pitfalls

- **Board-resolving a members' matter**: decisions reserved to shareholders (or needing a special resolution) can't be passed by the board alone — the record is invalid even if minuted perfectly.
- **Quorum lost mid-meeting**: a quorum present at the start but lost before the vote can void later resolutions — minute quorum throughout.
- **Silent conflict**: an interested director voting without disclosure taints the resolution — record disclosure and recusal every time.
- **Narrative minutes**: long "he said / she said" minutes that don't clearly state the decision fail an audit and a court — record decisions, not discussion.
- **Non-self-contained resolution**: a bank or registrar must act on the resolution alone; vague wording that references "as discussed" is unusable.

## References

- Volatile facts: cite `[verify current]` where an SS-1/SS-2 requirement, a special-resolution threshold, or a filing deadline under the Companies Act is load-bearing.
- Companies Act 2013 (board/members' powers, interested-director rules) and ICSI Secretarial Standards SS-1/SS-2 for Indian companies; the company's own articles; equivalent corporate-law formalities for other jurisdictions.
