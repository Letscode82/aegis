---
name: ip-infringement-takedown
description: >-
  Assesses IP infringement (copyright, trademark, or other) and drafts the right response: a cease-and-desist or
  takedown notice (DMCA-style, India IT Rules intermediary notice, platform/registrar process), or a defence/counter-
  notice to a received claim — testing the rights, the actual infringement, defences, and the correct channel. Use to
  pursue or respond to infringement. Not for clearing a new mark before adoption → ip/trademark-clearance; not for the
  copyright subsistence/ownership question → ip/copyright-assessment.
module: ip
version: 1.0.0
jurisdictions: [global, IN, US]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of enforce (assess + draft a notice/takedown against an infringer) or defend (assess + respond to a claim/takedown received, incl. counter-notice).
  - name: matter
    required: false
    description: The IP right at stake and proof of ownership, the alleged infringing use (where it appears — website, marketplace, app store, social), and the jurisdictions involved.
  - name: channel
    required: false
    description: Where enforcement/response runs — direct to the party, a platform/host/registrar takedown process, an intermediary under the IT Rules, or court.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [ip/trademark-clearance, ip/copyright-assessment, ip/ip-ownership-audit, disputes/legal-notice-drafter, disputes/early-case-assessment]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Infringement & Takedown

Takes an infringement situation (yours to enforce, or a claim against you) and returns a grounded assessment and the right response: whether the right and the infringement actually stand, what defences apply, and the correct channel — a C&D, a platform/IT-Rules takedown, or a counter-notice. The deliverable is an assessment + drafted notice/response with the overreach and defence traps flagged, not a scary letter.

## When to use / not use

- Use: assessing whether a use infringes your IP and drafting a C&D or takedown; choosing the enforcement channel (direct, platform/host, registrar, IT-Rules intermediary, court); responding to a takedown or infringement claim against you (including a counter-notice).
- Hand off: clearing a *new* mark before you adopt it → `ip/trademark-clearance`; the copyright subsistence/ownership/fair-use question behind the claim → `ip/copyright-assessment`; confirming you actually own the right (chain of title) → `ip/ip-ownership-audit`; a general pre-action demand not tied to IP infrastructure → `disputes/legal-notice-drafter`; the litigate-or-not merits/strategy → `disputes/early-case-assessment`.

## Inputs to collect first

1. The **IP right** at stake and **proof of ownership/registration** — you can't enforce what you can't show you own → `ip/ip-ownership-audit`.
2. The **alleged infringing use**: exactly what, where it appears (website, marketplace, app store, social, domain), and since when.
3. The **jurisdictions** involved and the **channel** available (direct, platform process, registrar, IT-Rules intermediary, court).
4. For defend mode: the **claim/takedown received** and your possible defences.

## Method

1. **Confirm the right and ownership first.** Verify the right subsists, you own/are licensed to enforce it, and (for registered rights) it's live and in the relevant class/territory — overreaching on a weak or unowned right backfires and can expose you to a groundless-threats claim.
2. **Test actual infringement, not vibes.** Apply the real test: copyright = copying + substantial similarity of protected expression → `ip/copyright-assessment`; trademark = likelihood of confusion (similar mark + related goods + channels) → `ip/trademark-clearance`. Identify precisely which element the alleged use infringes.
3. **Screen the other side's defences before sending.** Fair use/fair dealing, independent creation, descriptive/nominative use, exhaustion/first-sale, parody, licence/consent, limitation — a notice that ignores an obvious defence invites a confident refusal and reputational blowback.
4. **Avoid improper/overreaching threats.** Don't threaten relief you won't or can't pursue, or make **unjustified groundless threats** (actionable in some jurisdictions for patents/trademarks/designs); don't threaten criminal process for leverage. Calibrate the tone to the strength of the case.
5. **Pick the right channel.** Direct **cease-and-desist**; a **platform/host takedown** (DMCA-style notice for US-hosted copyright; marketplace/app-store IP processes); a **domain** registrar/UDRP route; or, in India, a **notice to the intermediary under the IT Rules** (with the required particulars for actual-knowledge/takedown) `[verify current]`. Court/injunction where the harm or defiance warrants it.
6. **Draft the notice with the mandatory particulars.** Identify the right, the work/mark, the infringing material and its exact location, the demand and deadline, and the good-faith/accuracy statements the channel requires (DMCA and IT-Rules notices have prescribed contents); include the service/host details.
7. **Defend mode — assess and respond proportionately.** Test whether the claim actually stands and whether a **defence** applies; options range from comply/remove, to a reasoned rebuttal, to a **counter-notice** (DMCA) or challenge — weigh the restoration/put-back and litigation consequences before counter-noticing.
8. **Preserve evidence and keep proof.** Capture the infringing use (dated screenshots/URLs), keep proof of sending/service, and log platform ticket numbers — the record matters if it escalates.
9. **Score against the Checks table** and set a determination: **INFRINGEMENT STANDS → enforce via <channel>** / **WEAK — DON'T SEND** (enforce), or **CLAIM STANDS → comply** / **DEFENSIBLE → respond/counter-notice** (defend).

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Right/ownership not confirmed | Subsistence + ownership + live registration checked | S1 | Verify before enforcing → ip-ownership-audit |
| Infringement asserted without the test | Copying/similarity or confusion element identified | S1 | Apply the real infringement test |
| Other side's defence ignored | Fair use/exhaustion/licence/limitation screened | S1 | Screen defences before sending |
| Groundless / improper threat | Only lawful, intended relief threatened | S1 | Remove the overreach |
| Wrong channel for the harm/host | Direct/platform/registrar/IT-Rules/court matched | S2 | Re-route to the right channel `[verify current]` |
| Notice missing mandatory particulars | DMCA/IT-Rules prescribed contents included | S2 | Complete the notice |
| Evidence not preserved | Dated capture + proof of service kept | S2 | Capture and log the evidence |
| (Defend) counter-notice sent without weighing consequences | Put-back + litigation exposure assessed | S2 | Weigh before counter-noticing |

## Output

Lead with `Determination: INFRINGEMENT STANDS → enforce via <channel> | WEAK — DON'T SEND` (enforce) or `CLAIM STANDS → comply | DEFENSIBLE → <respond/counter-notice>` (defend). Then the output contract. Add:

- **Right & infringement**: the right, ownership proof, and the element infringed.
- **Defences**: the other side's likely defences and whether they hold.
- **Channel & notice**: the chosen route and the notice/response (with mandatory particulars).
- **Risk flags**: groundless-threat / overreach / counter-notice exposure.
- One JSON finding per issue with `category: "infringement"`.

## Edge cases & pitfalls

- **Enforcing a weak/unowned right**: a C&D on a right you can't prove you own, or that's descriptive/expired, invites a confident refusal and a groundless-threats counter — confirm first.
- **Ignoring an obvious defence**: sending a takedown into a clear fair-use/nominative-use situation (common with criticism, reviews, parody) backfires publicly and can be actionable.
- **Overreaching threats**: threatening relief you won't pursue, or criminal process for leverage, damages credibility and can create liability.
- **Wrong channel**: a C&D to a party ignoring you when a platform/IT-Rules takedown would remove the content fast wastes time — match channel to the host and harm.
- **Counter-notice without thinking**: a DMCA counter-notice can trigger put-back *and* invite suit — weigh the consequence before firing it.

## References

- Volatile facts: `IN-AI-02` where synthetic-content takedown timelines apply; cite `[verify current]` on IT-Rules intermediary notice particulars/timelines and platform/UDRP processes — these change.
- The governing IP statutes and the relevant notice regimes (US DMCA §512; India IT Rules 2021 intermediary process; marketplace/app-store/registrar IP processes; UDRP for domains); groundless-threats provisions where applicable.
