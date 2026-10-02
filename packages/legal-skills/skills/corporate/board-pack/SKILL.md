---
name: corporate-board-pack
description: >-
  Assembles the legal section of a board or committee pack: material matters, risk movements, decisions
  sought, directors'-duty framing and draft resolutions. Use when Legal must report to the board, audit
  committee or risk management committee, or someone asks for "the legal update for the board", a litigation
  or compliance report for directors, or a paper seeking board approval. Not for drafting minutes or formal
  resolutions alone → corporate/board-minutes-resolutions.
module: corporate
version: 1.0.0
jurisdictions: [IN, UK, US, global]
risk_tier: review-required
inputs:
  - name: forum
    required: true
    description: Board, audit committee (AC), risk management committee (RMC), CSR/NRC committee, or subsidiary board; and the entity.
  - name: meeting_date
    required: true
    description: Meeting date; drives the circulation deadline and the reporting cut-off.
  - name: matter_portfolio
    required: true
    description: AEGIS Matters / Risk Graph export (disputes, investigations, regulatory, major contracts) with prior-pack ratings.
  - name: decisions_needed
    required: false
    description: Items management wants approved (settlements, litigation authority, transactions, policies, RPTs).
  - name: listing_status
    required: false
    description: Listed (which exchanges), debt-listed, unlisted public, private, or foreign. Changes the rulebook.
  - name: prior_pack
    required: false
    description: Last pack's legal section, for movement tracking and follow-up of open actions.
  - name: materiality_policy
    required: false
    description: Board-approved materiality / disclosure policy and delegation of authority (DoA).
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md]
related: [corporate/board-minutes-resolutions, corporate/listed-company-disclosure, corporate/corporate-governance-review, corporate/entity-compliance-calendar, matters/status-report, disputes/early-case-assessment, regulatory/whistleblower-programme]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Board Pack — Legal Section

Directors do not need a matter list; they need to know what has changed, what could hurt the company, and what they are being asked to decide. This skill turns the legal portfolio into a short, decision-led paper that lets directors discharge their oversight duty on the record, and drafts the resolutions for anything that needs approval. The outcome is a paper counsel can sign off and the company secretary can circulate.

## When to use / not use

- Use for: quarterly legal and compliance reports; litigation and contingent-liability updates for the AC; legal-risk input to the RMC; one-off papers seeking approval (settlement above DoA, commencement of major litigation, regulator undertakings, material transaction, policy adoption).
- Hand off: minutes and the formal resolution text after the meeting → `corporate/board-minutes-resolutions`; whether an event must be disclosed to the exchange → `corporate/listed-company-disclosure`; board composition or charter gaps → `corporate/corporate-governance-review`; a new dispute that needs a merits view first → `disputes/early-case-assessment`.

## Inputs to collect first

1. **Forum and entity** — the board, AC and RMC have different statutory remits; a subsidiary board must not be told what only the parent needs.
2. **Listing status** — listed entities carry SEBI LODR overlays (below) and price-sensitivity risk in the paper itself.
3. **Materiality threshold** — from the materiality policy or DoA. If none, use the default rules in step 3 and say so.
4. **Decisions sought** — with the commercial owner, the amount, and who currently holds authority.
5. **Privilege status** of each dispute item (see pitfalls).

## Method

1. **Fix the cut-off and forum.** Reporting date = pack cut-off; state it. Map each item to the forum whose charter covers it (AC: financial reporting, contingent liabilities, vigil mechanism, RPTs; RMC: risk framework and cyber; board: strategy, approvals beyond committee authority).
2. **Pull the portfolio and compute movement** against the prior pack: new, escalated, de-escalated, closed. An item that has not moved and is below threshold goes in the annex, not the body.
3. **Apply materiality** (default if no policy): an item goes in the body if any of —
   - exposure (reasonable worst case) ≥ the lower of 2% of turnover, 2% of net worth, or 5% of 3-year average absolute PAT — the LODR Reg 30(4) quantitative test, used as a proxy even for unlisted entities [verify current];
   - it is rated Red on the 3×4 matrix in `_shared/severity-scale.md`;
   - it involves a regulator, criminal exposure, a director/KMP, a whistleblower allegation, or reputational harm likely to be reported in the press;
   - the board must decide something about it.
4. **Score each body item** S1–S4 × likelihood; give a one-line reason for the likelihood call. Never change a rating without stating why it moved.
5. **Frame each decision** as: the question, options considered (incl. do nothing), recommendation, cost/exposure, who has authority, and what the directors must be satisfied of. Each decision paper must give directors enough to show they acted with due and reasonable care, skill and diligence and exercised independent judgment (Companies Act 2013 s.166(3)), in good faith in the company's and stakeholders' interests (s.166(2)).
6. **Check authority before drafting a resolution.** Matters reserved to the board by Companies Act 2013 s.179(3) (e.g. borrowing, investing funds, loans/guarantees, approving financial statements and board report, diversifying the business, mergers/amalgamations, takeovers) must be passed at a meeting; shareholder approval needed under s.180 thresholds or s.188 RPT limits must be flagged as a further step. If a resolution is beyond the forum's authority → S2 and re-route.
7. **Conflicts.** For every decision, ask whether any director is interested (s.184 disclosure; interested director not to participate under s.184(2)) and whether the counterparty is a related party (s.188; LODR Reg 23 for listed). Record the interested director's recusal in the draft resolution recital.
8. **Draft the resolution(s)** in operative form, with an authorisation clause naming designations (not individuals) and limits.
9. **Close the loop.** List actions from the prior pack and their status. Open actions over two cycles → escalate in the body.
10. **Privilege and disclosure review** of the paper itself before release (pitfalls).

## Checks / issue list

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Decision without options or cost | Options, recommendation, exposure range, authority stated | S2 | Return to owner; directors cannot show informed judgment |
| Approval beyond forum authority | Matches s.179(3), committee charter and DoA | S2 | Re-route to board / general meeting; add second-step resolution |
| Interested director / RPT not identified | s.184 disclosure tabled; s.188 / Reg 23 route identified; AC prior approval for listed RPTs | S2 (S1 if listed and no AC approval) | Add recusal recital; route to AC first |
| Contingent liabilities not reconciled | Legal ratings align with Ind AS 37 provisioning/disclosure in the financial statements | S2 | Reconcile with Finance before circulation |
| Compliance certificate missing (listed) | Board periodically reviews compliance reports for all applicable laws and remedial steps (LODR Reg 17(3)) | S2 | Attach compliance dashboard and exceptions |
| Whistleblower matter in body names the accused | Anonymised; only AC chair sees identities (Companies Act s.177(9)–(10); LODR Reg 22 vigil mechanism) | S2 | Redact; route detail to AC chair directly |
| Price-sensitive information in pack | UPSI handled under SEBI PIT Regulations: structured digital database entry, need-to-know circulation | S2 | Mark UPSI; log recipients |
| Privileged advice pasted verbatim | Summarised conclusion; advice in a separate privileged annex | S3 | Rewrite; restrict annex circulation |
| Stale items carried forward | Movement shown; unchanged low items moved to annex | S4 | Trim |
| Regulator matter not escalated | Any regulator investigation or show-cause in the body regardless of amount | S2 | Move to body; consider Reg 30 disclosure |
| Cyber incident | Reported to RMC/board with notification status (`IN-CERTIN-01`, `EU-GDPR-01`, `US-SEC-01`) | S1 if a deadline is open | Hand to `privacy/breach-response` |

## Committee angles

- **Audit committee (Companies Act s.177; LODR Reg 18 & Part C of Schedule II)**: contingent liabilities and provisioning, RPT approvals and omnibus approvals, vigil-mechanism functioning, fraud reporting by auditors (s.143(12)), internal-control findings with a legal root cause, legal spend if material. Frame legal ratings so the AC can test Finance's provisioning.
- **Risk management committee (LODR Reg 21; applies to the top listed entities by market capitalisation [verify current])**: movements on the legal and regulatory risk register, cyber security, regulatory change pipeline, and whether mitigations are on track. Use the 3×4 matrix; show trend arrows.
- **Board**: decisions, items above committee authority, strategy-relevant regulatory change, and the AC/RMC chairs' escalations.

## Other jurisdictions

- **UK**: directors' general duties in Companies Act 2006 ss.171–177; s.172 requires regard to the listed stakeholder factors, so decision papers should show those were considered; s.177 declaration of interest in proposed transactions. Large companies report on s.172 in the strategic report (s.414CZA).
- **US (Delaware)**: the duty of oversight requires a reasonable reporting system and attention to red flags — *In re Caremark International Inc. Derivative Litigation*, 698 A.2d 959 (Del. Ch. 1996); *Marchand v. Barnhill*, 212 A.3d 805 (Del. 2019) (board-level monitoring of mission-critical compliance risk). The legal section is part of that record: show the board received and acted on reports. Business-judgment protection depends on an informed process. [verify citations with `research/citation-verification`]
- Foreign subsidiaries: report under the local entity's law; do not import s.166 language into a UK or US subsidiary paper.

## Output

Follow `_shared/output-contract.md`. The Markdown body is the paper itself, in this order:

1. **Header** — entity, forum, meeting date, cut-off, author, classification (`Privileged & Confidential` / `UPSI` where applicable), `Draft — requires lawyer review`.
2. **Bottom line** — up to three sentences: what changed, the top risk, decisions sought.
3. **Decisions sought** — numbered; each with recommendation and authority.
4. **Material matters** — table: matter · forum · S-level × likelihood (rating) · movement · exposure range · provision status · next milestone.
5. **Risk movements** — new / escalated / de-escalated / closed, one line each with reason.
6. **Regulatory horizon** — changes in force in the next two quarters with owner.
7. **Actions from prior meeting** — status.
8. **Draft resolutions** — e.g.:

```
RESOLVED THAT, pursuant to section 179 of the Companies Act, 2013 and the Delegation of Authority Policy,
the Board approves the settlement of [matter] on the terms set out in Annex [x], for an amount not
exceeding INR [ ] inclusive of costs;
RESOLVED FURTHER THAT the [General Counsel] and the [Chief Financial Officer], jointly, be authorised
to finalise, sign and deliver the settlement agreement and do all acts necessary to give effect to
this resolution. [Director X, being interested, did not participate — s.184(2).]
```

9. **Annex** — below-threshold items; privileged annex separately.

JSON: findings are the body items (category `board-matter`), actions include company-secretary circulation, Finance reconciliation and any disclosure check.

## Edge cases & pitfalls

- **Privilege**: board packs are widely circulated and often disclosed in later litigation or to regulators. Put conclusions, not reasoning, in the body; keep counsel's advice in a restricted annex. Indian privilege attaches to communications with legal advisers (Bharatiya Sakshya Adhiniyam 2023, ss.132–134); whether it covers in-house counsel is unsettled in India [general principle — verify] — do not rely on it.
- **Reg 30 trap**: a decision taken at the meeting (e.g. settlement, litigation commencement above threshold) can itself be disclosable within tight timelines. Run `corporate/listed-company-disclosure` before the meeting so the CS is ready.
- **Exposure numbers** must match Finance's figures or explain the difference (legal reasonable-worst-case vs accounting best estimate).
- Never minimise: directors who were not told cannot be said to have overseen. If in doubt about including an item, include it in one line.
- Subsidiary boards: give the subsidiary's own exposure, not group figures.
- Circular resolutions (s.175) are not available for s.179(3) matters; flag if management proposes one.
- Notice and circulation: board meeting notice at least seven days (s.173(3)); agenda papers per SS-1 [verify current]. Late papers → note the shortened-notice basis.
