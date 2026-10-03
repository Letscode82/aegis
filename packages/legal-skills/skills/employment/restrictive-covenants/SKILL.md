---
name: employment-restrictive-covenants
description: >-
  Assesses and drafts post-employment restrictive covenants — non-compete, non-solicit (customers/employees),
  non-dealing and confidentiality — for enforceability by jurisdiction: legitimate interest protected, reasonableness
  of scope/duration/geography, consideration, and the local-law reality (e.g. non-competes largely void in India
  s.27 and in much of the US). Use to draft or test covenants. Not for the whole employment policy stack →
  employment/employment-policy-drafter; not for a trade-secret/IP-ownership question → ip/ip-ownership-audit.
module: employment
version: 1.0.0
jurisdictions: [global, IN, US, UK]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of draft (produce covenants), review (test a clause's enforceability) or enforce-check (assess whether an existing covenant can be relied on against a departing employee).
  - name: context
    required: false
    description: The jurisdiction(s) and the employee's role/seniority and access to clients/confidential info, the legitimate interest at stake, and the proposed scope/duration/geography.
  - name: constraints
    required: false
    description: Any consideration offered, garden-leave availability, and whether this is at hire, mid-employment, or on exit.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [employment/employment-policy-drafter, ip/ip-ownership-audit, employment/termination-risk, disputes/early-case-assessment, contracts/contract-review]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Restrictive Covenants

Takes a restrictive-covenant need (or an existing clause) and returns an enforceability-driven assessment and draft: what legitimate interest is protected, whether the scope/duration/geography is reasonable *in the relevant jurisdiction*, and whether it will actually bite — because in many places the default answer is "void". The deliverable is a jurisdiction-aware enforceability verdict + draft, not a boilerplate non-compete.

## When to use / not use

- Use: drafting non-compete / non-solicit / non-dealing / confidentiality covenants; testing whether an existing clause is enforceable; deciding whether to rely on a covenant against a departing employee.
- Hand off: the general handbook/policy suite → `employment/employment-policy-drafter`; protecting trade secrets / IP ownership (a stronger route than a void non-compete) → `ip/ip-ownership-audit`; the dismissal-risk analysis around an exit → `employment/termination-risk`; the merits of litigating/injuncting a breach → `disputes/early-case-assessment`; covenants embedded in a commercial/sale agreement → `contracts/contract-review`.

## Inputs to collect first

1. The **jurisdiction(s)** governing the employment — enforceability varies enormously and this is the first question.
2. The employee's **role, seniority, and access** to clients, confidential information, and key relationships.
3. The **legitimate interest** to protect (trade secrets, client connections, stable workforce) — the thing a court actually weighs.
4. The proposed **scope, duration, geography**, any **consideration/garden-leave**, and the stage (hire/mid-term/exit).

## Method

1. **Lead with the jurisdiction's baseline — it's often restrictive.** In **India, s.27 of the Contract Act** voids most post-employment non-competes (in-term restraints and genuine confidentiality survive); several **US states (notably California) ban employee non-competes**, and US federal/state law is tightening `[verify current]`. The UK and others enforce only **reasonable** covenants. Don't draft a US/UK-style non-compete for India and assume it works.
2. **Anchor to a legitimate protectable interest.** Courts enforce covenants only to protect a legitimate interest (trade secrets/confidential info, customer connections, workforce stability) — not to suppress ordinary competition. Name the interest; a covenant without one is unenforceable.
3. **Prefer the narrowest tool that protects the interest.** A **confidentiality** clause and a **non-solicit/non-deal** (customers, employees) are far more enforceable than a blanket non-compete; use the least-restrictive covenant that does the job — and trade-secret/IP protection may do it better → `ip/ip-ownership-audit`.
4. **Test reasonableness on three axes.** **Duration** (months, proportionate to the interest), **geography** (where the interest actually exists), and **scope of activity/clients** (limited to those the employee dealt with, not the whole market). Over-broad on any axis risks the whole covenant being struck down (and many courts **won't rewrite**/blue-pencil it).
5. **Check consideration and timing.** A covenant imposed mid-employment or on exit may need fresh **consideration** to bind; one buried in a signed-later document may fail. At hire, the job is usually consideration; confirm per jurisdiction `[verify current]`.
6. **Consider garden leave as an alternative/complement.** Paid garden leave can protect the interest during notice without an unenforceable post-termination restraint — often the more reliable lever.
7. **Draft defensively.** Tie each restriction to the named interest, keep each axis minimal and severable (separate covenants so one failing doesn't sink the rest), and avoid cascading/over-reaching definitions.
8. **For enforce-check:** assess likelihood of an injunction, the clean-hands/breach-by-employer risk, and whether the interest and reasonableness will hold — and whether a trade-secret claim is the stronger route.
9. **Score against the Checks table** and set a verdict: **ENFORCEABLE (as drafted) / ENFORCEABLE IF NARROWED / LIKELY VOID**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Jurisdiction baseline ignored (void-by-default) | Local enforceability confirmed first | S1 | Re-assess for the jurisdiction `[verify current]` |
| No legitimate protectable interest named | Covenant tied to a real interest | S1 | Name the interest or drop the covenant |
| Blanket non-compete where a narrower tool fits | Confidentiality / non-solicit preferred | S2 | Use the least-restrictive covenant |
| Duration unreasonable | Proportionate, short period | S1 | Shorten to what's defensible |
| Geography over-broad | Limited to where the interest exists | S2 | Narrow the territory |
| Activity/client scope too wide | Limited to the employee's actual dealings | S2 | Restrict to relevant clients/activity |
| No / insufficient consideration | Fresh consideration where required | S2 | Provide consideration `[verify current]` |
| Not severable (all-or-nothing) | Separate, severable covenants | S2 | Split the restrictions |
| Garden-leave alternative not considered | Garden leave weighed | S3 | Consider garden leave |

## Output

Lead with `Verdict: ENFORCEABLE | ENFORCEABLE IF NARROWED | LIKELY VOID — <jurisdiction> — <key reason>`. Then the output contract. Add:

- **Jurisdiction baseline**: the local default and what survives it.
- **Interest**: the legitimate interest each covenant protects.
- **Reasonableness**: duration · geography · activity/client scope.
- **Consideration & alternatives**: consideration status, garden leave, trade-secret route.
- **Draft / redline** of the covenants (severable). One JSON finding per issue with `category: "restrictive-covenant"`.

## Edge cases & pitfalls

- **India s.27**: a post-employment non-compete is generally **void** in India — relying on one is the classic error; use confidentiality + in-term restraints + trade-secret protection instead.
- **California / US bans**: employee non-competes are void in California and increasingly restricted elsewhere in the US — a US-wide template is wrong.
- **Over-broad = all void**: many courts won't blue-pencil an over-wide covenant — one unreasonable axis can strike the whole thing, so keep each axis minimal and severable.
- **No fresh consideration**: a covenant added mid-employment without new consideration may not bind — check the timing.
- **Non-compete when non-solicit would do**: reaching for the broadest restraint when a narrower, enforceable one protects the interest just loses in court — match the tool to the interest.

## References

- Volatile facts: cite `[verify current]` on jurisdiction enforceability (India s.27; US state/federal non-compete bans, which are actively changing; UK reform proposals). This is a fast-moving area.
- Indian Contract Act s.27; US state non-compete statutes and any federal rule; UK reasonableness case law; and the employer's trade-secret/IP protections as the alternative route.
