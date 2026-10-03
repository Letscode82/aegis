---
name: employment-employment-policy-drafter
description: >-
  Drafts or reviews employee handbooks and HR policies aligned to local law and company practice: the mandatory
  policies for the jurisdiction, lawful and enforceable terms, consistency across the policy stack, the contractual-vs-
  discretionary status of each policy, and a sensible review/acknowledgement mechanism. Use to build or refresh a
  handbook or a single policy. Not for a statutory labour-code obligation analysis → employment/india-labour-codes;
  not for POSH-specific set-up → employment/posh-compliance.
module: employment
version: 1.0.0
jurisdictions: [global, IN]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of draft (produce a policy/handbook), review (assess an existing one for legality/consistency) or gap-check (identify the mandatory/expected policies missing for the jurisdiction).
  - name: policy
    required: false
    description: The policy or handbook in scope (leave, disciplinary, remote work, code of conduct, etc.) and any existing draft or current version.
  - name: context
    required: false
    description: The jurisdiction(s) and workforce profile, whether terms should be contractual or discretionary, company culture/practice, and any union/works-council involvement.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [employment/india-labour-codes, employment/posh-compliance, employment/restrictive-covenants, drafting/policy-drafter, regulatory/whistleblower-programme]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Employment Policy Drafter

Takes a handbook or policy need and returns lawful, consistent, enforceable policies aligned to both local law and how the company actually operates: the mandatory set for the jurisdiction, terms that comply, the contractual-vs-discretionary status made explicit, and a workable acknowledgement/review loop. The deliverable is a usable policy set with the legal and consistency risks flagged, not generic HR boilerplate.

## When to use / not use

- Use: building an employee handbook or a single policy; reviewing an existing one for legality and internal consistency; checking which policies are mandatory or expected for a jurisdiction; refreshing a stack after a law change.
- Hand off: the statutory analysis of labour-code obligations the policies implement → `employment/india-labour-codes`; the POSH Internal-Committee/inquiry set-up (a statutory regime of its own) → `employment/posh-compliance`; non-compete/garden-leave enforceability → `employment/restrictive-covenants`; the general (non-employment) policy-drafting craft → `drafting/policy-drafter`; the whistleblowing channel specifically → `regulatory/whistleblower-programme`.

## Inputs to collect first

1. The **jurisdiction(s)** and the **workforce profile** (employees vs contractors, locations, remote/hybrid).
2. Whether each policy is intended to be **contractual** (binding, hard to change) or **discretionary/guidance** (flexible) — this status drives the drafting.
3. The **company's actual practice** and culture — a policy that contradicts practice is worse than none.
4. Any **union/works-council** consultation requirement and the existing policy stack.

## Method

1. **Scope the mandatory and expected set for the jurisdiction.** Identify which policies are legally required (e.g. POSH policy, equal-opportunity, specific statutory notices) vs best-practice/expected; don't ship a handbook missing a mandatory policy, and don't copy another country's mandatory list `[verify current]`.
2. **Fix the contractual vs discretionary status of each policy — explicitly.** State clearly whether a policy forms part of the contract or is discretionary guidance the employer can vary; silent contractual status locks the employer into terms it can't easily change, while discretionary wording preserves flexibility. Get this right per policy.
3. **Draft terms that are lawful.** Each policy must comply with local statutory floors (leave, working time, notice, minimum wage, anti-discrimination, data protection of employee data) — a policy can't contract below the statutory minimum.
4. **Keep the stack internally consistent.** Definitions, leave interactions, disciplinary ladders, and cross-references must line up across policies; contradictions between the handbook and the contract (or between two policies) are a frequent and exploitable defect.
5. **Make discretion defensible.** Where a policy confers discretion (bonus, discipline, performance), draft it to be exercised reasonably/non-discriminatorily and reserve variation rights properly — unfettered or arbitrary discretion is challengeable.
6. **Reflect real practice.** Align the drafted policy with what the company actually does; a strict written policy routinely ignored creates evidence against the employer and inconsistent-treatment claims.
7. **Add the operational scaffolding.** Effective date, version, owner, review cadence, the **acknowledgement** mechanism (so employees are bound/on notice), and the change/consultation process (including union/works-council where required).
8. **Flag sensitive policies for specialist routing.** POSH, whistleblowing, restrictive covenants, and data-protection policies have their own regimes → route rather than improvise.
9. **Score against the Checks table** and set a verdict: **COMPLIANT & CONSISTENT / FIXES NEEDED / NON-COMPLIANT**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Mandatory policy missing for the jurisdiction | Required set identified and present | S1 | Add the mandatory policy `[verify current]` |
| Contractual vs discretionary status unstated | Each policy's status explicit | S1 | Label status; reserve variation rights |
| Term below a statutory floor | Policies meet local minimums | S1 | Raise to the statutory floor |
| Internal inconsistency (handbook vs contract/policy) | Definitions + ladders + cross-refs aligned | S2 | Reconcile the stack |
| Discretion drafted as unfettered/arbitrary | Reasonable, non-discriminatory exercise | S2 | Re-draft the discretion |
| Policy contradicts actual practice | Written policy matches what's done | S2 | Align policy or practice |
| No acknowledgement / notice mechanism | Acknowledgement + effective date + version | S2 | Add the sign-off loop |
| Union/works-council consultation skipped | Required consultation completed | S2 | Consult before adopting |
| Specialist policy improvised | POSH/whistleblowing/covenants routed | S2 | Route to the specialist skill |

## Output

Lead with `Verdict: COMPLIANT & CONSISTENT | FIXES NEEDED | NON-COMPLIANT — <policy/handbook> — <key issue>`. Then the output contract. Add:

- **Coverage**: mandatory/expected policies present vs missing for the jurisdiction.
- **Status map**: each policy's contractual-vs-discretionary status.
- **Legality & consistency**: statutory-floor and cross-policy findings.
- **Operational**: acknowledgement, version, review cadence, consultation.
- **Draft / redline** of the policy. One JSON finding per issue with `category: "employment-policy"`.

## Edge cases & pitfalls

- **Accidental contractual status**: a handbook silent on status can be read as contractual, trapping the employer in terms it can't vary — state discretionary status deliberately.
- **Below-the-floor terms**: a policy can't undercut statutory minimums (leave, notice, wage) — copying a laxer jurisdiction's terms is a live risk.
- **Policy vs practice gap**: a strict written rule the company doesn't enforce becomes evidence of inconsistent treatment — align the two.
- **Copy-paste across borders**: another country's mandatory list and lawful terms don't transfer — localise the set.
- **Unfettered discretion**: bonus/discipline clauses drafted as absolute discretion are challengeable — build in reasonableness and non-discrimination.

## References

- Volatile facts: `IN-LAB-01` where labour-code obligations shape the policy; cite `[verify current]` where a mandatory-policy requirement or statutory floor is load-bearing.
- Local employment statutes (working time, leave, notice, anti-discrimination, employee data protection); the mandatory-policy list per jurisdiction; the company's contracts and actual practice.
