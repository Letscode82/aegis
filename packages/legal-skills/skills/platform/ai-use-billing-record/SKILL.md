---
name: platform-ai-use-billing-record
description: >-
  Produces a defensible time-and-billing record for AI-assisted legal work: whether the AI-saved time may be billed,
  how to describe the work without padding or false hours, when to disclose AI use to the client or under outside-
  counsel guidelines, and the confidentiality check before client data touches a model — grounded in the reasonable-
  fee duty. Use to record/review AI-assisted time or set a billing-disclosure policy. Not for the AI-decision audit
  trail → platform/ai-work-audit-trail; not for reviewing a firm's invoice → outside-counsel/invoice-review.
module: platform
version: 1.0.0
jurisdictions: [global]
risk_tier: review-required
inputs:
  - name: work
    required: true
    description: The AI-assisted task — what the AI did, actual human time spent reviewing/finalising, and the fee model (hourly / fixed / contingent) it will be billed under.
  - name: mode
    required: false
    description: One of record (produce the time entry + disclosure for one piece of work) or policy (set the firm/team's AI-billing + disclosure rules).
  - name: constraints
    required: false
    description: The engagement letter / outside-counsel guidelines terms on efficiency, technology and disclosure; the client's AI stance; and the bar/jurisdiction whose rules govern.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [platform/ai-work-audit-trail, outside-counsel/billing-guidelines, outside-counsel/invoice-review, outside-counsel/fee-arrangements, regulatory/ai-governance]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# AI-Use Time & Billing Record

Takes a piece of AI-assisted legal work and returns a defensible billing record: what may be charged, how the entry is described honestly, whether and how AI use is disclosed, and the confidentiality check before client data touches a model. The deliverable is a compliant time entry + disclosure (or a billing policy), grounded in the reasonable-fee duty — not a bigger number.

## When to use / not use

- Use: recording time for work an AI tool assisted; checking whether AI efficiency gains can be billed and how to describe them; setting a firm/team policy for AI-use disclosure and billing; preparing for an outside-counsel-guidelines or client question about AI on the bill.
- Hand off: the end-to-end reconstructable record of what the AI did and who approved it → `platform/ai-work-audit-trail`; reviewing an outside firm's submitted invoice → `outside-counsel/invoice-review`; the OCG/billing-guideline terms themselves → `outside-counsel/billing-guidelines`; structuring the fee arrangement (fixed/AFA) → `outside-counsel/fee-arrangements`; the AI-governance policy framing → `regulatory/ai-governance`.

## Inputs to collect first

1. The **work**: what the AI did, the **actual human time** spent directing/reviewing/finalising it, and the **fee model** (hourly, fixed, contingent).
2. The **engagement terms / outside-counsel guidelines** on technology, efficiency and disclosure, and the **client's AI stance**.
3. The **governing bar/jurisdiction** whose professional-conduct rules apply.
4. Whether **client-confidential data** was or will be entered into the tool, and the tool's confidentiality posture.

## Method

1. **Confidentiality gate first — before billing is even in question.** If client-confidential or privileged data went into a model, confirm it was a tool approved for that data (no training on inputs, appropriate contract) and that confidentiality duties were met; a billing entry can't launder a confidentiality breach → `regulatory/ai-governance`.
2. **Bill *time actually spent*, never time the AI saved.** Under an hourly model you charge the human hours genuinely worked (directing, reviewing, correcting the AI); you do **not** bill the hours the task *would* have taken without the tool. Inventing or inflating hours to capture the efficiency gain is a false record and a reasonable-fee violation `[verify current]`.
3. **Don't double-charge the tool.** A general AI-subscription cost is overhead recovered through rates, not a separate client disbursement, unless the engagement expressly allows a specific, actual, reasonable cost to be passed through — check the terms before adding any AI line-item.
4. **Describe the work honestly and specifically.** The narrative reflects what was done (e.g. "review and revise AI-assisted first draft of X"); avoid both padding and misleadingly implying unaided manual work where disclosure or the client's expectations require candour. No block-billing that hides the AI-assisted portion.
5. **Resolve disclosure to the client.** Decide whether AI use must be disclosed — driven by the engagement letter / OCGs (many now require consent or prohibit AI on certain work), the bar's guidance, and the materiality of the AI's role. When in doubt on a material use, disclose; silence where terms require consent is the risk.
6. **Apply the fee model correctly.** On **fixed/AFA/contingent** fees the efficiency benefit is generally the firm's to keep (that's the deal) — but the reasonable-fee duty, honest narratives and any OCG efficiency-sharing term still bind. On hourly, efficiency reduces the bill; don't restructure to hourly just to recapture it.
7. **Keep the evidence trail.** Preserve what supports the entry — actual time, the AI's role, the approval that a human reviewed the output — so the bill is defensible on audit → `platform/ai-work-audit-trail`.
8. **(Policy mode)** set firm/team rules: approved tools + data classes, the bill-time-not-savings rule, the narrative standard, the disclosure trigger, and the no-pass-through-without-terms rule.
9. **Score against the Checks table** and output the time entry + disclosure decision (or the policy), with the reasonable-fee basis stated.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Client data in an unvetted tool | Approved-for-data tool; confidentiality met | S1 | Stop; resolve confidentiality first |
| Billing time the AI saved, not time spent | Only actual human hours billed (hourly) | S1 | Correct to real hours |
| Padded / invented hours | Hours reflect work genuinely done | S1 | Remove the inflation |
| Tool cost double-charged | Overhead in rate; pass-through only if terms allow | S2 | Drop the line-item or cite the term |
| Narrative misleading / block-billed | Specific, honest description of the work | S2 | Rewrite the narrative |
| Disclosure required but not made | AI use disclosed where OCG/bar/materiality requires | S1 | Disclose per the terms `[verify current]` |
| Fee model misapplied | Efficiency handled correctly per fee type | S2 | Apply the right model |
| No evidence trail | Time + AI role + human approval preserved | S3 | Build the record → ai-work-audit-trail |

## Output

Lead with `Billing record: <billable? y/n> — disclose AI: <y/n> — reasonable-fee basis: <one line>`. Then the output contract. Add:

- **Time entry**: the hours and the honest narrative.
- **Billability**: what may and may not be charged, and why (fee model + reasonable-fee duty).
- **Disclosure**: whether AI use is disclosed, to whom, and the trigger (OCG/bar/materiality).
- **Confidentiality note**: the data-into-tool check result.
- One JSON finding per billing/disclosure issue with `category: "ai-billing"`.

## Edge cases & pitfalls

- **Billing the counterfactual**: charging the hours a task *would* have taken without AI is a false time record — bill only time actually spent.
- **Confidentiality laundering**: a tidy bill does not cure client data having been fed into an unvetted model; the confidentiality breach is the headline issue.
- **Silent material use under consent-required terms**: where the engagement letter/OCGs require disclosure or consent for AI, staying quiet is the violation.
- **Restructuring to recapture savings**: flipping an hourly matter to fixed purely to keep the efficiency gain, or padding to the same effect, is a reasonable-fee problem.
- **Pass-through by default**: adding an AI-tool line to the invoice without an express, actual-cost term double-charges overhead already in the rate.

## References

- Volatile facts: cite `[verify current]` on the governing bar's AI-billing/disclosure guidance and any OCG term — these are evolving quickly and vary by jurisdiction and client.
- The reasonable-fee and confidentiality duties under the applicable professional-conduct rules; recent bar/ethics opinions on generative-AI billing and disclosure; the engagement letter and outside-counsel guidelines in force.
