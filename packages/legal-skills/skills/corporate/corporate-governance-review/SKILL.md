---
name: corporate-corporate-governance-review
description: >-
  Reviews a company's governance health: board composition and independence, committee structure and charters
  (audit / nomination / remuneration), the delegation-of-authority matrix, meeting and quorum discipline, related-party
  and conflict controls, and the policy stack. Use for a governance health check or to stand governance up for a
  growing company. Not for drafting a specific board minute/resolution → corporate/board-minutes-resolutions; not for
  listed-disclosure timelines → corporate/listed-company-disclosure.
module: corporate
version: 1.0.0
jurisdictions: [global, IN]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of health-check (assess current governance against good practice/law), gap-fix (prioritise and plan the fixes) or stand-up (design governance for a company that lacks it).
  - name: company
    required: false
    description: The entity type and size (private / listed / regulated), its board and committee structure, and the governing company law and (if listed) listing rules.
  - name: materials
    required: false
    description: Board/committee charters, the delegation-of-authority matrix, the policy stack, recent minutes, and any related-party arrangements.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [corporate/board-minutes-resolutions, corporate/listed-company-disclosure, corporate/entity-compliance-calendar, corporate/shareholder-agreement, regulatory/whistleblower-programme]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Governance Health Check

Takes a company's governance set-up and returns where it is sound and where it is exposed: board/committee structure, delegation of authority, meeting discipline, and the conflict/related-party controls — scored and prioritised. The deliverable is a governance gap list with fixes ranked by risk, not a restatement of good-governance principles.

## When to use / not use

- Use: a governance health check for a board/GC; standing up governance for a company that has outgrown informal practice; preparing for a financing, listing, or audit that will scrutinise governance; fixing a specific failure (quorum defects, missing charters, uncontrolled delegation).
- Hand off: drafting a particular resolution/minute → `corporate/board-minutes-resolutions`; the listed-company disclosure/materiality/PIT regime → `corporate/listed-company-disclosure`; the statutory filing/compliance calendar → `corporate/entity-compliance-calendar`; shareholder-level rights and deadlock → `corporate/shareholder-agreement`; the whistleblowing/speak-up channel specifically → `regulatory/whistleblower-programme`.

## Inputs to collect first

1. The **entity type and status** — private, listed, or regulated (the governance bar rises sharply across these).
2. The **governing company law** and, if listed/regulated, the listing/regulatory governance rules.
3. The current **board and committee** structure, charters, and the **delegation-of-authority** matrix.
4. The **policy stack** (code of conduct, conflicts, related-party, insider-trading, whistleblowing) and recent **minutes**.

## Method

1. **Set the applicable standard first.** Governance requirements scale with status — a private company's baseline differs from a listed company's listing-rule obligations (independent directors, mandatory committees, woman director, etc.) `[verify current]`. Assess against the right bar, not a one-size checklist.
2. **Board composition and independence.** Size, mix of executive/non-executive/independent, any mandated independence or diversity requirement, chair/CEO separation, and whether directors have the time and competence; check appointment/retirement and any director-eligibility/DIN requirements.
3. **Committee structure and charters.** Confirm the required committees exist (audit, nomination & remuneration, stakeholder/risk, CSR where applicable), each with a current **charter**, correct composition, and an actual meeting cadence — not charters that exist on paper only.
4. **Delegation of authority.** Review the DoA matrix: are approval limits defined and appropriate, do they reserve the right matters to the board, and is there a gap where material decisions are taken without clear authority? Uncontrolled or undocumented delegation is a frequent, serious gap.
5. **Meeting and decision discipline.** Quorum, notice, conflicted-director recusal, minute quality, and the use of written/circular resolutions within their limits — defects here can invalidate decisions → `corporate/board-minutes-resolutions`.
6. **Conflicts and related-party transactions.** Test the conflict-of-interest and **related-party-transaction** controls: disclosure, recusal, audit-committee/board/shareholder approval thresholds, and the arm's-length basis — RPTs are a top governance and disclosure risk.
7. **Policy stack and assurance.** Check the code of conduct, insider-trading code (if relevant), whistleblowing channel, risk management, and internal audit/assurance lines are present and operating.
8. **Flow-through to compliance and disclosure.** Confirm governance decisions feed the statutory filings → `corporate/entity-compliance-calendar` and (if listed) disclosures → `corporate/listed-company-disclosure`.
9. **Score against the Checks table**, rank the gaps by risk, and output a prioritised remediation plan.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Wrong standard applied (private vs listed/regulated) | Governance assessed against the right regime | S1 | Re-baseline to the applicable rules `[verify current]` |
| Board independence/composition requirement unmet | Mandated independent/diversity mix satisfied | S1 | Appoint to meet the requirement |
| Required committee or charter missing | All mandated committees + current charters | S2 | Constitute the committee; adopt a charter |
| Delegation-of-authority gaps / undocumented | DoA matrix with limits + board-reserved matters | S1 | Build/repair the DoA matrix |
| Quorum / recusal / notice defects | Meeting discipline sound; conflicts recused | S2 | Fix the process → board-minutes-resolutions |
| Related-party controls weak | Disclosure + recusal + approval thresholds met | S1 | Tighten RPT approvals |
| Conflicts policy absent/ignored | COI policy present and operating | S2 | Adopt/enforce the policy |
| Policy stack incomplete | Code/insider/whistleblowing/risk in place | S2 | Fill the policy gaps |
| Governance not feeding compliance/disclosure | Decisions flow to filings/disclosures | S3 | Wire the flow-through |

## Output

Lead with `Governance: SOUND | GAPS TO FIX | MATERIALLY DEFICIENT — <company> — <top exposure>`. Then the output contract. Add:

- **Board & committees**: composition/independence + committee/charter status.
- **Delegation of authority**: the DoA findings and board-reserved matters.
- **Process**: meeting/quorum/recusal and minute discipline.
- **Conflicts & RPTs**: the control findings.
- **Remediation plan**: gaps ranked by risk with owners.
- One JSON finding per gap with `category: "governance"`.

## Edge cases & pitfalls

- **Paper committees**: a charter that exists but whose committee never meets (or meets without quorum) is worse than none — test operation, not just existence.
- **Uncontrolled delegation**: material spend or commitments made with no documented authority expose both the company and the individuals — the DoA matrix is load-bearing.
- **RPT blind spots**: related-party deals slipped through without recusal/approval are a governance and disclosure failure at once — test the controls hard.
- **One-size checklist**: applying listed-company requirements to a small private company (or vice versa) produces false gaps or false comfort — set the standard first.
- **Minutes as an afterthought**: thin minutes that don't show the decision, the conflict handling, or the authority can invalidate decisions and fail an audit.

## References

- Volatile facts: cite `[verify current]` where an independent-director, committee, woman-director, or RPT-approval threshold under the Companies Act / listing rules is load-bearing.
- The governing company law (e.g. Companies Act 2013 + rules in India) and listing-rule governance code where listed; recognised governance codes; the company's own charters, DoA matrix, and policy stack.
