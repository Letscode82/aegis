---
name: employment-workplace-investigation
description: >-
  Plans and runs a fair, defensible workplace investigation into a conduct, harassment, discrimination or grievance
  allegation: scope and investigator independence, interim measures, evidence preservation, witness and interview
  plan, procedural fairness, standard of proof, findings and the report. Use to scope or run an internal
  investigation, or to review one for defensibility. Not for a regulator-facing inquiry →
  disputes/regulatory-investigation; not for the termination risk assessment afterwards → employment/termination-risk.
module: employment
version: 1.0.0
jurisdictions: [global, IN, UK]
risk_tier: review-required
inputs:
  - name: allegation
    required: true
    description: What is alleged, by and against whom, when, and how it surfaced (complaint, grievance, whistleblower report, management referral).
  - name: context
    required: false
    description: Seniority/power dynamics, prior history, jurisdiction and applicable policy/contract, union or works-council involvement, and any safety/retaliation risk.
  - name: mode
    required: false
    description: One of scope (plan the investigation), run (work a live investigation to findings) or review (assess an existing investigation for fairness/defensibility). Defaults to scope.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [employment/termination-risk, regulatory/whistleblower-programme, employment/posh-compliance, disputes/regulatory-investigation, disputes/litigation-hold, drafting/policy-drafter]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Workplace Investigation

Turns an allegation into a fair, documented investigation that will hold up if challenged: the right scope and an independent investigator, interim measures that protect people without pre-judging, a disciplined evidence and interview plan, procedural fairness for both sides, and a findings report tied to a clear standard of proof. The deliverable is an investigation plan or a defensibility assessment, not a verdict reached on the papers.

## When to use / not use

- Use: scoping or running an internal investigation into misconduct, harassment, discrimination, bullying, fraud or a formal grievance; reviewing a completed investigation for fairness before acting on it.
- Hand off: a regulator or external authority is involved → `disputes/regulatory-investigation`; the dismissal/exit risk analysis once findings land → `employment/termination-risk`; a POSH (India sexual-harassment) complaint with its own statutory ICC process → `employment/posh-compliance`; the speak-up channel the report came through → `regulatory/whistleblower-programme`; preserving evidence/devices → `disputes/litigation-hold`.

## Inputs to collect first

1. The allegation: what, by whom, against whom, when, and how it surfaced.
2. Power dynamics and seniority (a complaint against a senior leader changes investigator independence needs).
3. Jurisdiction, the applicable policy/contract, and any union/works-council or statutory process (e.g. India POSH ICC).
4. Immediate risk: safety, retaliation, evidence destruction, ongoing harm.
5. Confidentiality constraints and who genuinely needs to know.

## Method

1. **Assess interim measures first** — before investigating, decide whether anyone needs protecting now: separation of parties, adjusted reporting lines, suspension (neutral, not a sanction), or access restrictions. Protect without signalling a pre-judged outcome.
2. **Preserve evidence immediately** — emails, messages, documents, access logs, CCTV, devices. Suspend auto-deletion → `disputes/litigation-hold`. Evidence lost after a complaint undermines everything.
3. **Set scope and pick an independent investigator.** Scope the specific allegations (don't let it sprawl); the investigator must be impartial, unconnected to the parties and sufficiently senior/trained — external where seniority or conflict requires.
4. **Check the governing process.** Some complaints trigger a mandated procedure (statutory, policy or contractual) that dictates timelines, panel composition and the complainant's rights — follow it rather than an ad-hoc process. Flag `[verify current]` where a statutory process binds.
5. **Plan evidence and interviews.** Order: complainant → witnesses → subject (so the subject can respond to specifics). Prepare questions from the allegations, keep contemporaneous notes, and treat all accounts as untested until corroborated.
6. **Deliver procedural fairness** to the subject: told the allegations in enough detail to respond, given a chance to answer and to put forward their own evidence/witnesses, and (where the policy/jurisdiction requires) accompanied. Fairness to the complainant too: taken seriously, kept informed, protected from retaliation.
7. **Apply the right standard of proof** — internal investigations generally decide on the **balance of probabilities** ("more likely than not"), not a criminal standard. State the standard and apply it to each allegation separately.
8. **Make findings, not just a narrative.** For each allegation: substantiated / not substantiated / inconclusive, with the evidence and reasoning. Keep findings separate from the sanction decision (that's a later, separate step → `employment/termination-risk`).
9. **Write the report** so it is defensible: scope, process followed, evidence considered, analysis against the standard, findings, and recommendations — fair, factual, and free of conclusions the evidence doesn't support.
10. **Guard against retaliation** throughout and after; a credible complaint followed by detriment to the complainant is its own, often larger, liability.
11. **Score against the Checks table** and set a decision: **PROCEED TO PLAN / FINDINGS SOUND / NOT DEFENSIBLE (remediate)**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Evidence not preserved on notice of the complaint | Hold + preservation before investigating | S1 | Preserve now → `disputes/litigation-hold` |
| Investigator not independent of the parties | Impartial, unconnected, trained (external if needed) | S1 | Replace the investigator |
| Subject denied a fair chance to respond | Allegations put + opportunity to answer + evidence | S1 | Re-interview; cure the fairness gap before any decision |
| Mandated statutory/policy process bypassed | The binding procedure identified and followed | S1 | Restart under the correct process |
| Retaliation against complainant/witnesses | Active anti-retaliation protection | S1 | Intervene; treat as a fresh, serious matter |
| Interim measures framed as a sanction | Neutral, proportionate, non-prejudicial | S2 | Reframe; document the neutral basis |
| Wrong standard of proof applied | Balance of probabilities, stated and applied | S2 | Re-assess each allegation on the civil standard |
| Findings mixed with the sanction decision | Findings kept separate from penalty | S2 | Split the steps |
| Scope sprawl / fishing beyond the allegation | Scoped to the specific allegations | S3 | Re-scope; log any new matter separately |
| Confidentiality breached beyond need-to-know | Tight, documented information circle | S3 | Contain; remind handlers |

## Output

Lead with `Status: PROCEED TO PLAN | FINDINGS SOUND | NOT DEFENSIBLE — <matter> — <key reason>`. Then the output contract. Add:

- **Interim measures**: what protects people now, and why it's neutral.
- **Investigation plan**: scope · investigator · evidence to preserve · interview order · governing process.
- **Fairness checklist**: the specific steps giving each side a fair process.
- **Findings** (run/review mode): per allegation, outcome + standard + evidence.
- One JSON finding per gap with `category: "workplace-investigation"`.

## Edge cases & pitfalls

- **Pre-judging via suspension**: suspension is a neutral precaution, not a punishment — say so, keep it proportionate, and revisit it.
- **Investigator conflict**: "we'll have HR do it" fails when HR reports to the subject; seniority and independence are not optional for serious or senior-level complaints.
- **India POSH and similar statutory regimes**: a sexual-harassment complaint may require a specific committee, composition and timeline — do not run it as a generic investigation → `employment/posh-compliance`.
- **Over-documentation of conclusions**: a report that editorialises or reaches legal conclusions the evidence can't carry becomes a liability in litigation; stick to findings on the facts.
- **Retaliation is the bigger case**: mishandling the aftermath (freeze-outs, missed promotions) often dwarfs the original allegation.

## References

- Volatile facts: cite live where a statutory process/timeline is load-bearing; mark `[verify current]`.
- Applicable employment law and natural-justice/procedural-fairness principles for the jurisdiction; the organisation's disciplinary and grievance policy; India POSH Act 2013 where relevant.
