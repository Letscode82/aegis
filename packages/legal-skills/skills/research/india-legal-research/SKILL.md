---
name: research-india-legal-research
description: >-
  A disciplined workflow for researching an Indian-law question: find the governing statute and the current amended
  text, the rules/notifications/circulars under it, and the binding Supreme Court / High Court position — distinguishing
  binding ratio from obiter, checking a judgment is still good law, and flagging where a provision is recently changed
  or unnotified. Use for any India-law research question. Not for structured reading of a single provision →
  research/statute-analysis; not for a multi-country comparison → research/multi-jurisdiction-survey.
module: research
version: 1.0.0
jurisdictions: [IN]
risk_tier: review-required
inputs:
  - name: question
    required: true
    description: The legal question, the facts that make it concrete, and the area of law (so the right statute/regulator is found).
  - name: jurisdiction_detail
    required: false
    description: Whether a specific state's law applies, which forum the issue would be litigated in, and the date/period the facts arose (law may have changed).
  - name: sources
    required: false
    description: Any statute text, judgments, notifications or commentary already to hand that the answer must be built from or reconciled with.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [research/statute-analysis, research/multi-jurisdiction-survey, research/source-locked-answering, corporate/fdi-fema-assessment, disputes/arbitration-strategy]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Indian Legal Research

Takes an India-law question and returns a sourced answer built in the right order: the governing statute as currently amended, the delegated rules/notifications/circulars, and the binding case-law position — with each proposition cited and each volatile or recently-changed point flagged. The deliverable is a defensible research memo with a confidence level, not a confident-sounding paragraph.

## When to use / not use

- Use: answering any question of Indian law where the current statutory text, subordinate legislation, or the binding judicial position matters; building the authority base for an opinion; checking whether a known rule has changed.
- Hand off: a close structured reading of one provision's elements → `research/statute-analysis`; comparing India against other jurisdictions → `research/multi-jurisdiction-survey`; answering strictly from a fixed set of supplied documents with no outside authority → `research/source-locked-answering`; an FDI/FEMA-specific question → `corporate/fdi-fema-assessment`; an arbitration-law question feeding strategy → `disputes/arbitration-strategy`.

## Inputs to collect first

1. The precise question and the facts that make it concrete (the facts drive which provision and which precedent apply).
2. Whether **state** law applies (many subjects are State or Concurrent List) and the likely forum.
3. The **date** the facts arose — Indian statutes change often and recent Acts may be enacted but **not yet notified** into force.
4. Any sources already held that the memo must reconcile with.

## Method

1. **Find the governing statute — current amended version.** Identify the primary Act and confirm you have the text **as amended** and **as in force on the relevant date**; a recent amendment may be passed but not notified, leaving the old provision operative `[verify current]`.
2. **Go down the hierarchy.** Statute → Rules → Regulations → Notifications/Circulars → clarifications. Much operative Indian law lives in delegated legislation and regulator circulars (RBI/SEBI/MeitY/CBDT), not the bare Act.
3. **Check Centre vs State and the right regulator.** Confirm legislative competence (Union/State/Concurrent List) and the correct regulator; a State amendment or a sector regulator's circular can displace the general rule.
4. **Find the binding judicial position.** Supreme Court binds all; a High Court binds within its territory. Distinguish the **ratio** (binding) from **obiter**, note the bench strength (a larger bench overrules a smaller), and prefer the latest authoritative statement.
5. **Confirm each judgment is still good law.** Check it has not been overruled, distinguished into irrelevance, or superseded by statute — citing a reversed judgment is the classic research failure.
6. **Reconcile conflicts.** Where High Courts differ or a provision is ambiguous, say so, give the better view with reasons, and flag the uncertainty rather than papering over it.
7. **Separate settled law from open questions.** Mark what is clearly established, what is arguable, and what has no authority — and give a confidence level per proposition.
8. **Cite everything.** Every proposition carries its authority (Act + section, rule/notification number + date, case citation). An uncited assertion is a liability → where the brief forbids outside authority use `research/source-locked-answering`.
9. **Score against the Checks table** and set an answer with a **CONFIDENCE: HIGH / MEDIUM / LOW** label and the open points.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Old / superseded statutory text used | Current amended, in-force text confirmed for the date | S1 | Re-pull the in-force version `[verify current]` |
| Recent Act cited as in force but unnotified | Commencement/notification status verified | S1 | Check the notification; apply the law actually in force |
| Delegated legislation / circular missed | Rules + notifications + regulator circulars checked | S2 | Search the subordinate layer |
| State vs Central law confused | Competence + applicable State law confirmed | S2 | Apply the correct level/State |
| Ratio vs obiter not distinguished | Binding ratio separated from obiter | S2 | Re-read for the holding |
| Judgment overruled / no longer good law | Subsequent history checked | S1 | Replace with current authority |
| Conflicting High Court views unflagged | Split noted; better view reasoned | S2 | State the conflict and the preferred view |
| Assertions uncited | Every proposition carries its authority | S2 | Add citations or mark as unsupported |
| Confidence overstated on an open point | Confidence labelled per proposition | S3 | Downgrade to MEDIUM/LOW with the gap |

## Output

Lead with `Answer: <short answer> — CONFIDENCE: HIGH | MEDIUM | LOW`. Then the output contract. Add:

- **Governing law**: the Act (as amended, in-force date) + the key provision(s).
- **Subordinate law**: rules / notifications / circulars relied on, with numbers and dates.
- **Case law**: binding authorities with citations, ratio stated, good-law check noted.
- **Open questions / risks**: conflicts, unnotified provisions, thin authority.
- One JSON finding per material uncertainty with `category: "india-research"`.

## Edge cases & pitfalls

- **Enacted ≠ in force**: a headline Indian Act can sit unnotified for months or years; apply the law actually commenced on the relevant date.
- **The answer is in a circular**: for RBI/SEBI/tax questions the operative rule is often a notification or master circular, not the parent Act — don't stop at the statute.
- **Overruled-but-still-cited**: an old chestnut may have been overruled by a Constitution Bench; always check subsequent history.
- **State-list surprises**: stamp duty, land, and many commercial subjects vary by State — a pan-India assertion is often wrong.
- **Headnote ≠ ratio**: relying on a reporter's headnote instead of reading the holding misstates the law.

## References

- Volatile facts: `IN-TAX-01`, `IN-LAB-01`, `IN-DPDP-01`, `IN-ARB-01`, `IN-COMM-01`, `IN-AI-01` and the other `IN-*` entries — recently-changed Indian law is exactly where this skill's "in-force on the date" check bites; cite `[verify current]` on any volatile point.
- Primary sources: India Code (bare Acts), the e-Gazette (notifications), regulator sites (rbi.org.in, sebi.gov.in, meity.gov.in, incometaxindia.gov.in), and SC/HC judgment portals.
