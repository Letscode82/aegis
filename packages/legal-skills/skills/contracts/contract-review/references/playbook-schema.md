# AEGIS Contract Playbook Schema (v1)

A playbook records the organisation's negotiating positions so that `contracts/contract-review` (and `contracts/redline-generator`, `contracts/negotiation-prep`, `contracts/tabular-review`) apply the same positions every time. It is a YAML file, one per contract family, owned by a named lawyer and versioned in AEGIS.

## 1. Top-level structure

```yaml
playbook:
  id: pb-services-customer          # unique, kebab-case
  title: Services & MSA — we are customer
  version: 2.3.0                     # semver; bump minor for new positions, major for changed walk-aways
  owner: Head of Commercial Legal    # role or named lawyer
  effective: 2026-07-01
  review_by: 2027-01-01              # stale after this date → reviewer warns
  contract_types: [msa, services, consultancy, outsourcing]
  our_role: customer                 # customer | supplier | licensor | licensee | distributor | partner | mutual
  governing_law_default: IN          # ISO country or sub-national code (e.g. US-NY, GB-ENG)
  value_bands:                       # optional; positions can override per band
    - id: low
      max_annual_value: 2500000      # in currency below
    - id: mid
      max_annual_value: 25000000
    - id: high                       # no max = everything above
  currency: INR
  approvals:                         # who can accept what
    S2: commercial-counsel
    S1: general-counsel
positions: [ ... ]                   # see §2
definitions_watchlist: [ ... ]       # see §3
escalation_triggers: [ ... ]         # see §4
```

## 2. Positions

Each position is one negotiable issue.

```yaml
- id: LOL-CAP-01
  topic: limitation_of_liability     # controlled vocabulary, §5
  title: Supplier aggregate liability cap
  applies_to:
    contract_types: [msa, services]
    value_bands: [mid, high]         # omit = all bands
  preferred:
    summary: Cap not less than the greater of INR 5 crore and 200% of annual fees.
    text: >-
      Each party's aggregate liability arising out of or in connection with this Agreement
      shall not exceed the greater of (a) INR 5,00,00,000 and (b) 200% of the Fees paid or
      payable in the 12 months preceding the event giving rise to the claim.
  fallbacks:                         # ordered ladder; rung 1 is closest to preferred
    - rung: 1
      summary: Greater of INR 2 crore and 150% of annual fees.
      text: "..."
      approval: business-owner       # who may accept this rung
    - rung: 2
      summary: 100% of annual fees with fixed floor of INR 1 crore.
      text: "..."
      approval: commercial-counsel
  walkaway:
    summary: Cap below 100% of annual fees, or cap with no fixed floor in year 1.
    test: "cap_multiple < 1.0 or floor == null"   # optional machine hint; human summary governs
  default_severity: S2               # used when outside the ladder
  rationale: >-                       # internal only — never shown to counterparty
    Our loss from service failure (cost of cover, data restoration) routinely exceeds one year's fees.
  detection_hints: ["limitation of liability", "aggregate liability", "shall not exceed"]
  related_positions: [LOL-CARVE-01, IND-DATA-01]
  jurisdiction_notes:
    IN: "LD clauses are capped at reasonable compensation (ICA s.74); do not treat LD as a cap substitute."
    GB-ENG: "UCTA s.3 reasonableness applies if on our standard terms."
  must_have: true                    # tag in proposed edits
```

### Field rules

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Stable identifier; findings cite it as `playbook_ref`. Never reuse a retired id. |
| `topic` | yes | From §5. Lets the reviewer map a clause to positions when headings differ. |
| `preferred` | yes | Our opening position. `text` is clause-library wording; `summary` is the test. |
| `fallbacks` | no | Ordered ladder. Absent = no flexibility; anything other than preferred is `outside_ladder`. |
| `walkaway` | no | Position at which we do not sign without the `approvals.S1` approver. |
| `default_severity` | yes | Severity for `outside_ladder`. `walkaway_triggered` is always S1. |
| `approval` (per rung) | no | Role that may accept that rung; drives the Approvals section. |
| `rationale` | no | Internal reasoning; exclude from any counterparty-facing output. |
| `jurisdiction_notes` | no | Keyed by governing-law code; reviewer applies the matching note. |
| `must_have` | no | Default `false`. Marks non-trade-able points. |

## 3. Definitions watchlist

Definitions that silently change operative clauses.

```yaml
definitions_watchlist:
  - term: Losses
    flag_if: "includes loss of profit or indirect loss"
    severity: S2
  - term: Affiliate
    flag_if: "excludes entities under common control"   # breaks our intra-group use rights
    severity: S3
```

## 4. Escalation triggers

```yaml
escalation_triggers:
  - id: ESC-GOV
    when: counterparty is a government or state-owned entity
    route_to: general-counsel
  - id: ESC-EXCL
    when: any exclusivity, non-compete or MFN binding our group
    route_to: competition-counsel
```

## 5. Topic vocabulary

`parties_and_definitions`, `scope_and_deliverables`, `acceptance`, `service_levels`, `payment`, `price_change`, `term_and_renewal`, `termination`, `exit_assistance`, `limitation_of_liability`, `liability_carve_outs`, `indirect_loss`, `indemnity`, `ip_ownership`, `ip_licence`, `confidentiality`, `data_protection`, `information_security`, `warranties`, `insurance`, `audit`, `subcontracting`, `personnel`, `assignment_change_of_control`, `force_majeure`, `governing_law`, `dispute_resolution`, `compliance`, `non_compete_exclusivity`, `notices`, `entire_agreement`, `survival`, `order_of_precedence`, `stamp_and_execution`.

## 6. How the reviewer reads a playbook

1. **Validate**: required fields present, `review_by` not past (else warn: "Playbook stale since <date>; positions applied but flagged"), `our_role` matches the deal role. If the role does not match, do not apply; fall back to defaults and say so.
2. **Select positions**: filter by `contract_types` and `value_bands` for this deal. If two positions share a topic, the more specific (`value_bands` set) wins.
3. **Locate**: map clauses to topics using headings, `detection_hints` and meaning — not headings alone. One clause can engage several positions.
4. **Compare** against `preferred.summary` (the test), then each `fallbacks[].summary` in order. First rung satisfied = the rung recorded.
5. **Score**: `matches` → none; rung 1 → S4; rung ≥2 → S3; `outside_ladder` → `default_severity`; `walkaway` met → S1. A playbook may override per rung with `severity:`.
6. **Explain**: cite `id`, quote the clause (≤25 words), state the gap to preferred in one line.
7. **Never disclose** `rationale`, `walkaway` or `approval` in counterparty-facing output.

## 7. Missing or partial playbooks

- No playbook: use `SKILL.md` default checklist and `clause-checklist.md`; label every finding `playbook_ref: default`.
- Playbook silent on a topic the contract contains: apply the default check and recommend a playbook update in Actions (owner: playbook owner).
- Playbook conflicts with mandatory law in the governing jurisdiction (e.g. a preferred LD figure that is penal under the governing law): law wins; raise a finding and a playbook-update action.
