---
name: employment-india-labour-codes
description: >-
  Assesses obligations under India's four Labour Codes (Wages; Social Security; Industrial Relations; Occupational
  Safety, Health & Working Conditions) and the transition from the legacy Acts: the unified wage definition and its
  knock-on to PF/gratuity/bonus, thresholds (standing orders, works committee, chapter-X), social-security coverage
  incl. gig/platform workers, and state-rule variation. Use for a labour-code compliance or impact check. Not for POSH
  inquiries → employment/posh-compliance; not for drafting a handbook → employment/employment-policy-drafter.
module: employment
version: 1.0.0
jurisdictions: [IN]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of impact-check (how the codes change this employer's obligations/costs), compliance-audit (gaps against the codes) or question (a specific code obligation).
  - name: employer
    required: false
    description: Headcount and states of operation, worker categories (workers/employees/contract/gig-platform), current wage structure (basic vs allowances), and whether standing orders/unions apply.
  - name: context
    required: false
    description: The specific concern — wage-definition impact, PF/gratuity cost, standing-orders/retrenchment thresholds, social-security coverage, or OSH/registration duties.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [employment/employment-policy-drafter, employment/posh-compliance, employment/restrictive-covenants, corporate/entity-compliance-calendar, research/india-legal-research]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Indian Labour Codes

Takes an Indian employer and returns how the four Labour Codes change its obligations and costs: the unified wage definition and its flow-through to PF/gratuity/bonus, the headcount thresholds that trigger duties, social-security coverage (including gig/platform workers), and where state rules vary. The deliverable is a code-impact or compliance assessment with the cost and threshold drivers flagged, not a summary of the codes.

## When to use / not use

- Use: assessing how the Labour Codes change an employer's wage, PF/gratuity, standing-orders, retrenchment, or social-security obligations; a compliance audit against the codes; answering a specific code obligation; costing the wage-definition impact.
- Hand off: a POSH Internal-Committee/inquiry matter → `employment/posh-compliance`; drafting the handbook/policies that implement the codes → `employment/employment-policy-drafter`; non-compete/garden-leave enforceability → `employment/restrictive-covenants`; the registration/return filing calendar → `corporate/entity-compliance-calendar`; finding the current in-force rule text → `research/india-legal-research`.

## Inputs to collect first

1. **Headcount and states** of operation — thresholds and the applicable **state rules** both turn on these.
2. **Worker categories** — "worker" vs "employee", contract labour, and **gig/platform** workers (newly in scope for social security).
3. The current **wage structure** (basic vs allowances split) — the single biggest cost driver under the new definition.
4. Whether **standing orders**, unions, or **works committees** currently apply, and the specific concern.

## Method

1. **Confirm in-force status for the date.** The four codes (Wages; Social Security; Industrial Relations; OSH) are in force from **21 Nov 2025**, but **central and state rules** are still being finalised in places — apply the law/rules actually commenced for the state and date `[verify current]`.
2. **Apply the unified "wages" definition first.** The codes impose a common wage definition where **excluded allowances are capped (broadly at 50%)**, so a basic-heavy recomputation raises **PF, gratuity, and bonus** bases. This is the dominant cost impact — model it before anything else.
3. **Map the thresholds that trigger duties.** Standing orders and Chapter-X (lay-off/retrenchment/closure permission) obligations turn on worker-count thresholds (e.g. the IR Code's 300-worker line for standing orders/permission, subject to state variation); the supervisor wage ceiling defines "worker" `[verify current]`.
4. **Check social-security coverage, including gig/platform.** PF/ESI coverage, the **gratuity** rule (5 years, or **1 year pro rata for fixed-term** employees), and the new **gig/platform-worker** social-security contributions and registration are a distinct, newly-widened obligation.
5. **Industrial-relations mechanics.** Works committee, grievance redressal, standing orders certification, notice/compensation for retrenchment, the **re-skilling fund**, and strike/notice provisions.
6. **OSH & registration.** Single registration/licence, worker welfare and working-hours/overtime rules, and the returns under the OSH Code.
7. **Flag state-rule divergence.** Thresholds, rates, and procedural rules vary by state and some states haven't notified rules — a pan-India assumption is often wrong; identify per-state gaps.
8. **Cost and remediate.** Quantify the wage-definition cost impact and list the compliance gaps (registration, policy, contract, payroll) with owners → `employment/employment-policy-drafter`, `corporate/entity-compliance-calendar`.
9. **Score against the Checks table** and set a determination: **COMPLIANT / GAPS TO FIX / MATERIAL IMPACT** with the cost drivers called out.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Wage definition / 50%-cap impact not modelled | Basic vs allowances recomputed; PF/gratuity/bonus base checked | S1 | Model the wage recomputation `[verify current]` |
| In-force / state-rule status assumed | Commenced code + notified state rules confirmed | S1 | Apply the law actually in force for the state |
| Thresholds (standing orders / Chapter-X) misapplied | Worker-count thresholds + state variation checked | S2 | Re-test the thresholds `[verify current]` |
| Gig/platform social security missed | New coverage + registration assessed | S2 | Add the gig-worker obligations |
| Gratuity fixed-term pro-rata overlooked | 5-yr or 1-yr-pro-rata (fixed-term) applied | S2 | Apply the correct gratuity rule |
| IR mechanics (grievance/retrenchment/re-skilling) gaps | Works committee + notice/compensation + fund set | S2 | Close the IR gaps |
| OSH registration/returns missed | Single registration + welfare/hours rules met | S2 | Register and file |
| State divergence ignored | Per-state thresholds/rates/rules checked | S2 | Map state-by-state |
| Payroll/contract/policy not updated | Contracts + payroll + handbook aligned | S3 | Remediate downstream docs |

## Output

Lead with `Labour codes: COMPLIANT | GAPS TO FIX | MATERIAL IMPACT — <employer> — <top driver>`. Then the output contract. Add:

- **Wage-definition impact**: the recomputation and the PF/gratuity/bonus cost effect.
- **Thresholds**: which duties are triggered at this headcount, per state.
- **Social security**: PF/ESI/gratuity + gig/platform coverage.
- **IR / OSH**: mechanics and registration obligations.
- **State divergence**: per-state gaps.
- One JSON finding per gap/impact with `category: "india-labour-codes"`.

## Edge cases & pitfalls

- **Allowance-heavy pay structures**: the capped-exclusion wage definition can sharply raise PF/gratuity costs for employers who pushed pay into allowances — this is usually the headline impact.
- **Rules not notified**: the codes are in force but a given state's rules may not be — applying un-notified rules (or ignoring notified ones) both mislead; check the state.
- **Gig/platform blind spot**: platform employers newly owe social-security contributions and registration — easy to miss because the legacy Acts never covered them.
- **Threshold-by-state**: the 300-worker standing-orders/permission line and others vary by state — a single national number is often wrong.
- **Fixed-term gratuity**: the 1-year pro-rata gratuity for fixed-term employees changes the cost of fixed-term hiring — don't apply the old 5-year rule blindly.

## References

- Volatile facts: `IN-LAB-01` (four codes in force 21 Nov 2025; rules being finalised), `IN-LAB-02` (IR-Code thresholds + re-skilling fund), `IN-GRAT-01` (gratuity under the Social Security Code). Cite `[verify current]` on any load-bearing threshold, rate, or state-rule status.
- The Code on Wages 2019, Code on Social Security 2020, Industrial Relations Code 2020, and OSH&WC Code 2020, plus the central and applicable state rules.
