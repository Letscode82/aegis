---
name: outside-counsel-billing-guidelines
description: >-
  Drafts or reviews outside-counsel guidelines (OCG) and the engagement letter: scope and staffing controls, rate and
  rate-freeze terms, the billing rules (increments, block-billing/travel/admin bans, budget + approval thresholds),
  conflicts, confidentiality/privilege and data handling, and the enforcement/audit mechanics. Use to stand up or
  tighten OCGs. Not for checking a specific invoice against the rules → outside-counsel/invoice-review; not for
  designing the fee model → outside-counsel/fee-arrangements.
module: outside-counsel
version: 1.0.0
jurisdictions: [global]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of draft (produce OCGs / engagement terms), review (assess an existing set or a firm's engagement letter) or gap-check (find missing controls vs good practice).
  - name: context
    required: false
    description: The client's matter mix and spend, whether an e-billing system is used, the firms engaged, and any existing OCG/engagement letter.
  - name: priorities
    required: false
    description: The cost/behaviour controls that matter most (rate freezes, staffing limits, budget discipline, diversity, data security).
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [outside-counsel/invoice-review, outside-counsel/fee-arrangements, outside-counsel/matter-budget, outside-counsel/panel-rfp, outside-counsel/performance-scorecard]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Engagement Terms & Billing Guidelines

Takes a client's outside-counsel relationship and returns guidelines and engagement terms that actually control cost and behaviour: scope and staffing limits, enforceable billing rules, budget discipline, and the conflicts/confidentiality/data terms — written so the invoice-review step has something to enforce. The deliverable is an enforceable OCG + engagement letter (or a review of one), not a wish-list the firm ignores.

## When to use / not use

- Use: drafting or refreshing outside-counsel guidelines and the engagement letter; reviewing a firm's proposed engagement terms; finding gaps in existing OCGs; aligning the guidelines with an e-billing system so rules are machine-enforceable.
- Hand off: auditing a specific invoice against the guidelines → `outside-counsel/invoice-review`; designing the fee model (fixed/capped/success) → `outside-counsel/fee-arrangements`; the per-matter budget/forecast → `outside-counsel/matter-budget`; selecting/structuring the firm panel → `outside-counsel/panel-rfp`; scoring firm performance after matters → `outside-counsel/performance-scorecard`.

## Inputs to collect first

1. The **matter mix and spend profile** (litigation vs transactional, volume), and whether an **e-billing** system enforces rules.
2. The existing **OCG / engagement letter** (for review) and the firms engaged.
3. The **priority controls** — rate freezes, staffing caps, budget thresholds, diversity, data security.
4. The governing-law and any regulatory constraints on the retainer.

## Method

1. **Set scope, staffing and rate controls.** Define who may work the matter (partner/associate/paralegal mix, no unapproved timekeepers), a **rate card + rate-freeze** (annual increases capped or frozen), and limits on partner time for routine work — the levers that actually move cost.
2. **Write enforceable billing rules.** Ban or limit **block-billing**, vague narratives, administrative/clerical time, internal conferencing beyond a cap, travel time (or bill at reduced rate), and first-class travel; set billing **increments** (0.1h) and require task-coded, itemised narratives — so `outside-counsel/invoice-review` can enforce them.
3. **Impose budget and approval discipline.** Require a **matter budget** up front, variance thresholds that trigger re-approval, and **pre-approval** for expensive steps (experts, e-discovery vendors, senior-partner surges) and for exceeding the budget → `outside-counsel/matter-budget`.
4. **Handle conflicts and confidentiality.** Conflict-check and ongoing-conflict disclosure obligations, confidentiality/privilege protection, and restrictions on using the client's matter for marketing or precedent without consent.
5. **Address data security and privilege.** Where the firm handles client data, set security standards, breach-notification duties, data-location/residency and return/deletion on closure — and preserve privilege across the e-billing/third-party chain.
6. **Add the modern-OCG terms.** Diversity-and-inclusion staffing expectations/reporting, efficiency/technology expectations, and any AI-use disclosure (whether the firm must disclose GenAI assistance and who bears the risk) `[verify current]` → `platform/ai-use-billing-record`.
7. **Make it enforceable.** Specify the consequence of non-compliance (write-downs, non-payment of non-compliant entries), the audit right, dispute mechanics, and that the OCG **prevails over the firm's engagement letter** on conflict — a common gap that guts the guidelines.
8. **Keep it proportionate.** Scale the controls to the relationship; a 40-page OCG for a small retainer gets ignored — target the rules that matter.
9. **Score against the Checks table** and set a verdict: **ENFORCEABLE & COMPLETE / GAPS TO FIX / WEAK (redraft)**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| No staffing / rate controls or rate freeze | Timekeeper mix + rate card + freeze set | S1 | Add staffing and rate terms |
| Billing rules vague / unenforceable | Block-billing/admin/travel rules + increments + task codes | S1 | Write machine-enforceable rules |
| No budget / variance / pre-approval discipline | Budget required + thresholds + pre-approvals | S1 | Add budget controls → matter-budget |
| Conflicts / confidentiality terms thin | Conflict disclosure + confidentiality + marketing limits | S2 | Strengthen the terms |
| Data security / privilege not addressed | Security standard + breach duty + return/deletion | S2 | Add the data terms |
| D&I / efficiency / AI-use terms absent | Modern-OCG expectations included | S3 | Add where relevant `[verify current]` |
| OCG doesn't prevail over engagement letter | Order-of-precedence clause present | S1 | Add the precedence clause |
| No consequence / audit right for non-compliance | Write-down + audit + dispute mechanics | S2 | Add enforcement teeth |
| Disproportionate / ignored-in-practice | Controls scaled to the relationship | S3 | Trim to what matters |

## Output

Lead with `OCG: ENFORCEABLE & COMPLETE | GAPS TO FIX | WEAK — <relationship> — <top gap>`. Then the output contract. Add:

- **Controls**: staffing · rates/freeze · billing rules (the enforceable list).
- **Budget discipline**: budget requirement, variance thresholds, pre-approvals.
- **Conflicts / confidentiality / data**: the terms and any gaps.
- **Enforcement**: precedence, consequence, audit right.
- **Draft / redline** of the OCG + engagement terms. One JSON finding per issue with `category: "billing-guidelines"`.

## Edge cases & pitfalls

- **Unenforceable narratives**: rules the e-billing system can't test (vague "reasonableness") get ignored — write task-code/increment/block-billing rules a reviewer or system can apply.
- **Engagement letter overrides OCG**: without an order-of-precedence clause, the firm's letter (with its own, laxer terms) can trump the guidelines — fix precedence.
- **No teeth**: guidelines with no write-down/non-payment consequence and no audit right are advisory — the firm bills as it likes.
- **Budget as decoration**: a budget requirement with no variance threshold or re-approval gate doesn't control overruns — tie spend to pre-approval.
- **Over-long OCGs**: a bloated guideline for a modest relationship gets filed and forgotten — proportion the controls.

## References

- Volatile facts: cite `[verify current]` where a bar rule on fee-sharing, AI-use disclosure, or client-data handling constrains the terms; `platform/ai-use-billing-record` for AI-disclosure interplay.
- Standard outside-counsel-guideline practice and e-billing task-code standards (e.g. UTBMS); the governing retainer/professional-conduct rules.
