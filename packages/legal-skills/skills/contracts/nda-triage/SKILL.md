---
name: contracts-nda-triage
description: >-
  Sorts an incoming NDA into SIGN, NEGOTIATE or ESCALATE and returns the exact edits needed. Use when someone
  uploads or forwards a non-disclosure, confidentiality or secrecy agreement, asks "can I sign this NDA", or
  Intake routes an NDA. Not for full commercial agreements that merely contain a confidentiality clause →
  contracts/contract-review.
module: contracts
version: 1.0.0
jurisdictions: [global, IN]
risk_tier: self-serve
inputs:
  - name: document
    required: true
    description: The NDA (docx, pdf or pasted text).
  - name: our_party
    required: false
    description: Which party we are. Inferred from the matter record or letterhead if not given.
  - name: purpose
    required: false
    description: Why information is being shared (evaluation, M&A, vendor pitch, hiring, partnership).
  - name: playbook
    required: false
    description: Organisation NDA positions. Falls back to the defaults below.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md]
related: [contracts/contract-review, contracts/redline-generator, intake/request-triage]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# NDA Triage

Most NDAs are low-value, high-volume paperwork. This skill gets the safe ones signed the same day, fixes the fixable ones with a short list of edits, and pulls the dangerous ones out of the self-serve lane. The business user gets a decision they can act on; Legal only sees what needs Legal.

## When to use / not use

- Use for stand-alone NDAs, confidentiality undertakings, clean-team agreements (with escalation, see below) and NDA renewals.
- Hand off to `contracts/contract-review` if the document grants licences, exclusivity, payment terms or other commercial obligations beyond confidentiality.

## Inputs to collect first

1. Who we are and whether we are **disclosing, receiving, or both**. This decides whether a term is good or bad for us.
2. Purpose of sharing. M&A or competitor discussions change the risk profile (see escalation triggers).
3. Whether personal data or source code will be shared.

If the user cannot answer (1), infer from the signature block and state the assumption at the top of the output.

## Method

1. **Classify structure**: one-way (we disclose / we receive) or mutual. If one-way and we are the receiving party, we hold most of the risk; review obligations strictly.
2. **Scan for out-of-scope terms** (licence grants, non-solicit, non-compete, exclusivity, standstill, residuals, IP assignment, payment). Any present → see table; several present → hand off to full review.
3. **Run the position checks** below. Score each departure using `_shared/severity-scale.md` from *our* side.
4. **Decide**:
   - **SIGN** — no finding above S4.
   - **NEGOTIATE** — highest finding S3, or S2 with a standard fallback available. Provide the edits.
   - **ESCALATE** — any S1, any escalation trigger, or more than three S2s.
5. **Draft the edits** as replacement text keyed to clause numbers, shortest change that fixes the problem.

## Position checks

| Issue | Acceptable position | If not | Default severity |
|---|---|---|---|
| Definition of Confidential Information | Information disclosed for the Purpose, marked or reasonably understood as confidential | Overbroad ("all information of any kind") when we receive → narrow; too narrow (marking only) when we disclose → add "reasonably understood" | S3 |
| Standard exclusions | Public domain, already known, independently developed, received from a third party without duty | Any missing exclusion when we receive | S2 |
| Compelled disclosure | Permitted with prompt notice where lawful, limited to what is required | Absent, or requires us to resist an order at our cost | S3 |
| Permitted recipients | Employees, affiliates, advisers with need to know and equivalent duties | Affiliates or advisers excluded when we need them | S3 |
| Term of obligations | 2–5 years from disclosure; trade secrets for as long as they remain secret | Perpetual for all information when we receive | S3 |
| Return / destruction | On request, with carve-out for backups and legal/regulatory retention | No retention carve-out | S4 |
| Remedies | Injunctive relief available; no liquidated damages | Liquidated damages or indemnity for any breach | S2 |
| Liability | Silent (general law) or mutual | One-way uncapped indemnity against us | S1 |
| Residuals clause | Absent | Present when we disclose → strike | S2 |
| Non-solicit / non-compete | Absent | Non-solicit ≤12 months for employees met through the process: S3. Non-compete or exclusivity: S1 | S1–S3 |
| IP / licence | "No licence granted" | Any licence or assignment of improvements | S1 |
| Governing law & forum | Our home law, or a neutral common-law seat; for Indian counterparties, Indian law with courts or arbitration seated in India is acceptable | Unfamiliar law with exclusive foreign courts | S3 |
| Personal data | Separate data terms or reference to the DPA | Personal data shared under NDA alone | S2 → also run `privacy/dpa-review` |

## Escalation triggers (always ESCALATE)

- Potential acquisition, investment or merger; standstill or no-poach language.
- Counterparty is a competitor (competition-law clean-team rules needed).
- Government, regulator or public-sector counterparty.
- Source code, unreleased financials, or material non-public information of a listed company (insider-trading controls; in India, SEBI PIT Regulations).
- Any clause the user says the business has already agreed orally.

## India-specific checks

- **Stamp duty**: NDAs executed in India generally attract stamp duty as an agreement under the relevant state stamp act. Unstamped documents are not void but are inadmissible in evidence until duty and penalty are paid. Flag `[verify current]` with the state of execution (`IN-STAMP-01`). Never quote a rate without the state schedule.
- **Non-compete**: post-term restraints are generally void under s.27 Indian Contract Act 1872; a non-compete in an NDA with an Indian party is S2 even if we benefit from it, because it is unlikely to be enforceable.
- **Execution**: e-signatures are valid under the IT Act 2000 for most agreements; check that the counterparty's signatory has authority.

## Output

Lead with a single line: `Decision: SIGN | NEGOTIATE | ESCALATE — <reason>`. Then follow `_shared/output-contract.md`. For NEGOTIATE, include a **Proposed edits** block:

```
cl. 2.1 — replace "all information of whatever nature" with
"information disclosed for the Purpose that is marked confidential or that a reasonable person would understand to be confidential"
```

For SIGN, add the signing checklist: correct entity name, signatory authority, date, stamp duty (India), counter-signed copy saved to the AEGIS contract record.

## Edge cases & pitfalls

- Mutual NDAs: score each clause from the side where we carry more exposure given the purpose, and say which side you chose.
- "Agreement to agree" NDAs embedded in term sheets: treat the confidentiality clause only; route the term sheet elsewhere.
- Counterparty paper that is the organisation's own template re-sent: diff against our template rather than re-reviewing from scratch.
- Do not accept a clause because it is "market"; check it against our role.
