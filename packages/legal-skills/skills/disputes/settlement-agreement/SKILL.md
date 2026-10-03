---
name: disputes-settlement-agreement
description: >-
  Drafts or reviews a settlement / release agreement: scope of the release (parties, claims, time), payment terms,
  confidentiality and non-disparagement, no-admission, tax treatment, dismissal/withdrawal mechanics, and the
  enforceability traps (consideration, authority, future/unknown claims, employment-specific requirements). Use to
  paper a settlement, review the other side's draft, or check a release is watertight. Not for the settle-vs-fight
  decision → disputes/early-case-assessment; not for the limitation/filing clock → disputes/deadline-calendar.
module: disputes
version: 1.0.0
jurisdictions: [global, IN, US]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of draft (produce a settlement agreement), review (assess the other side's draft) or release-check (confirm a release's scope and enforceability).
  - name: dispute
    required: false
    description: The claim(s) being settled, the parties (and any related/affiliated entities), the forum/stage, and whether proceedings are on foot.
  - name: terms
    required: false
    description: Agreed commercial terms — payment amount/timing, confidentiality, non-disparagement, any ongoing obligations — and whether this is an employment settlement.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [disputes/early-case-assessment, disputes/legal-notice-drafter, employment/termination-risk, disputes/deadline-calendar, contracts/contract-review]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Settlement Agreement

Takes agreed (or proposed) settlement terms and returns a release that actually ends the dispute and holds up: the right release scope, clean payment and dismissal mechanics, confidentiality that's enforceable, and no gap through which the claim can return. The deliverable is a drafted/reviewed agreement with the enforceability risks flagged, not a boilerplate release.

## When to use / not use

- Use: drafting a settlement/release once terms are agreed; reviewing the counterparty's draft; stress-testing whether a release is watertight and the dispute truly ends.
- Hand off: whether to settle at all and at what value → `disputes/early-case-assessment`; the pre-action demand that may precede settlement → `disputes/legal-notice-drafter`; an employment-exit's dismissal-risk analysis → `employment/termination-risk`; the limitation/filing deadlines → `disputes/deadline-calendar`; a general commercial-contract review of ongoing obligations → `contracts/contract-review`.

## Inputs to collect first

1. The claim(s) being settled and whether proceedings are on foot (affects dismissal/withdrawal mechanics and court approval).
2. The parties — and all **related/affiliated** entities and individuals who should be released or bound.
3. The commercial terms: amount, timing, instalments/security, and any ongoing obligations.
4. Whether this is an **employment** settlement (special statutory requirements often apply) or involves a minor/protected party (court approval).

## Method

1. **Define the release scope precisely** on three axes: **who** (which parties and affiliates, directors, employees), **what claims** (only this dispute, or all claims to date — and whether **unknown/future** claims are included), and **time** (claims up to the effective date). Over-narrow lets the claim return; over-broad may be unenforceable or rejected.
2. **Decide mutual vs one-way release** and match it to the deal — a paying party usually wants a full release *and* to give a limited one; spell out both directions.
3. **Handle unknown claims deliberately.** A general release doesn't always cover claims the releasor didn't know about; where that's intended, include the express waiver the governing law requires (e.g. a California Civil Code §1542-style waiver) `[verify current]` — don't assume "all claims" reaches unknown ones.
4. **Payment mechanics.** Amount, timing, method, instalments, and **security for non-immediate payment** (consent judgment held in escrow, personal guarantee, acceleration on default). Tie the release/dismissal to *receipt* of funds where the payer's covenant is weak.
5. **Dismissal / withdrawal mechanics.** If proceedings are on foot, specify the consent order / withdrawal / dismissal with or without prejudice and who files it and when — a signed settlement with no dismissal leaves the case live.
6. **Confidentiality & non-disparagement.** Make them enforceable: define permitted disclosures (advisors, tax, regulators, enforcement), carve out legally required disclosure and whistleblowing, and set a realistic remedy. Note courts may limit confidentiality in some contexts (e.g. harassment settlements) `[verify current]`.
7. **No-admission and tax.** State no admission of liability; address the **tax treatment / characterisation** of the payment and any withholding or gross-up — allocation between heads of claim can matter.
8. **Authority & consideration.** Confirm each signatory has authority (board/entity approval) and that there is consideration (or a deed). For a company, check internal approvals.
9. **Employment & protected parties.** Employment settlements often require specific formalities (independent legal advice, prescribed form, age-discrimination waiver timing) — follow them or the waiver fails → `employment/termination-risk`. Minors/incapacitated parties usually need court approval.
10. **Score against the Checks table** and set a decision: **ENFORCEABLE / ENFORCEABLE WITH CONDITIONS / NOT WATERTIGHT (fix)**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Release scope leaves the claim able to return | Parties/claims/time cover the intended release | S1 | Re-scope; name affiliates and the claim basis |
| Unknown/future claims intended but not expressly waived | Jurisdiction-specific unknown-claims waiver included | S1 | Add the express waiver `[verify current]` |
| Proceedings not dismissed/withdrawn by the agreement | Dismissal mechanics + who files + when | S1 | Add the consent order / withdrawal step |
| Payment not secured where the payer is weak | Security / escrow / release-on-receipt | S2 | Tie release to funds; add security |
| Confidentiality unenforceable or over-broad | Defined carve-outs + lawful-disclosure + whistleblowing | S2 | Add carve-outs; check sector limits |
| Employment statutory formalities missed | Independent-advice / prescribed-form requirements met | S1 | Follow the statutory route → `employment/termination-risk` |
| No/absent authority or consideration | Signatory authority confirmed; consideration or deed | S2 | Get approvals; use a deed if no consideration |
| Tax treatment / allocation ignored | Characterisation + withholding/gross-up addressed | S3 | Add the tax provisions |
| Minor/protected party without court approval | Approval obtained where required | S1 | Seek court approval |

## Output

Lead with `Decision: ENFORCEABLE | ENFORCEABLE WITH CONDITIONS | NOT WATERTIGHT — <dispute> — <key reason>`. Then the output contract. Add:

- **Release map**: parties (incl. affiliates) · claims · time · mutual/one-way · unknown-claims treatment.
- **Mechanics**: payment + security · dismissal/withdrawal · confidentiality carve-outs · no-admission · tax.
- **Validity checklist**: authority · consideration/deed · employment/protected-party formalities.
- **Draft or redline brief** (draft/review mode). One JSON finding per issue with `category: "settlement"`.

## Edge cases & pitfalls

- **"All claims" ≠ unknown claims**: many jurisdictions need an express unknown-claims waiver; a general release can leave latent claims alive.
- **Signed but not dismissed**: a settlement that doesn't dispose of the live proceedings leaves the case on foot and the payer exposed.
- **Affiliate gap**: releasing the entity but not its directors/employees (or vice versa) invites a repackaged claim against the un-released party.
- **Employment formalities**: statutory settlement/waiver requirements (advice, form, cooling-off, age-discrimination timing) are easy to miss and fatal to the waiver.
- **Confidentiality limits**: some jurisdictions restrict NDAs in harassment/discrimination settlements — an over-broad clause can be void or unlawful `[verify current]`.

## References

- Volatile facts: cite `[verify current]` where an unknown-claims-waiver rule, confidentiality limit, or employment-settlement formality is load-bearing.
- General contract/release law (scope, consideration, deeds, authority); jurisdiction-specific unknown-claims waivers; employment-settlement statutory requirements; court-approval rules for protected parties.
