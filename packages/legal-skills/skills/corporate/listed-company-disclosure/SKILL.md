---
name: corporate-listed-company-disclosure
description: >-
  Assesses an Indian listed company's disclosure obligations: SEBI LODR materiality (quantitative + qualitative),
  the stock-exchange disclosure timelines for a material event, and the insider-trading (PIT) controls — UPSI handling,
  trading windows, structured digital database and the code of conduct. Use to decide if an event is disclosable, by
  when, and whether it is UPSI. Not for FDI/FEMA routing → corporate/fdi-fema-assessment; not for board
  minutes/resolutions → corporate/board-minutes-resolutions.
module: corporate
version: 1.0.0
jurisdictions: [IN]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of materiality-check (is this a disclosable material event + by when), upsi-check (is this UPSI and what controls apply) or policy-review (assess the materiality / insider-trading policy).
  - name: event
    required: false
    description: The event or information (deal, result, litigation, rating change, agreement, board decision), its financial size, and when it occurred/was decided.
  - name: company
    required: false
    description: The listed entity, its materiality policy and thresholds, the relevant financials (for the quantitative test), and whether a related trading window is open.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [corporate/fdi-fema-assessment, corporate/board-minutes-resolutions, corporate/corporate-governance-review, corporate/entity-compliance-calendar, research/india-legal-research]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Listed Company Disclosure (SEBI LODR + PIT)

Takes a corporate event at an Indian listed company and returns whether it must be disclosed, by when, and whether it is unpublished price-sensitive information (UPSI) that locks down trading. The deliverable is a materiality + timeline + UPSI determination with the controls flagged, not a general summary of SEBI rules.

## When to use / not use

- Use: deciding whether an event is a **material event** requiring disclosure under LODR Reg. 30; computing the disclosure timeline; assessing whether information is **UPSI** under the PIT Regulations and what trading/communication controls follow; reviewing the company's materiality policy or insider-trading code.
- Hand off: inbound foreign investment routing/reporting → `corporate/fdi-fema-assessment`; the board paper/minutes/resolution for the decision → `corporate/board-minutes-resolutions`; the broader governance health check → `corporate/corporate-governance-review`; the recurring filing calendar → `corporate/entity-compliance-calendar`; finding the current regulation/circular text → `research/india-legal-research`.

## Inputs to collect first

1. The exact event/information, when it was **decided/occurred**, and who knows it.
2. The company's **materiality policy** and the quantitative thresholds it adopted.
3. The financials needed for the quantitative test (turnover, net worth, profit) from the last audited statements.
4. Whether a **trading window** is currently closed for the relevant persons, and whether the information has been made public.

## Method

1. **Run the materiality test — both limbs.** LODR Reg. 30 deems certain events material *per se* (Para A of the Schedule) and others material **if** they cross the company's quantitative threshold (Para B) **or** a qualitative test (would it influence an investment decision / the price). Apply both the deemed list and the thresholds `[verify current]`.
2. **Fix the disclosure clock.** A material event must be disclosed to the stock exchanges within the prescribed window — broadly **30 minutes** for board-meeting outcomes, **12 hours** for events emanating from within the company, and **24 hours** for those from outside — measured from the trigger; confirm the current timelines `[verify current]`.
3. **Draft to the standard.** Disclosure must be accurate, complete, and not misleading; where facts are still developing, disclose what is known and update — selective or partial disclosure breaches the regime.
4. **Test for UPSI.** Separately ask whether the information is **unpublished** and **price-sensitive** under the PIT Regulations (financial results, dividends, M&A, capital changes, key management changes, etc.). Materiality under LODR and UPSI under PIT overlap but are **not identical** — decide each.
5. **Apply the PIT controls if UPSI.** Close/keep closed the **trading window** for designated persons and their relatives; log the UPSI and its recipients in the **structured digital database (SDD)** with time-stamping and no deletion; share on a strict **need-to-know** basis under a legitimate purpose; follow the code of conduct.
6. **Watch the leak/rumour duty.** Confirmed market rumours affecting price may require verification/disclosure for top-ranked companies within the prescribed time `[verify current]`; don't let "no comment" become a selective-disclosure problem.
7. **Sequence disclosure and trading.** Public disclosure generally precedes reopening the window; pre-clearance and the cooling-off/contra-trade rules apply to designated persons' trades.
8. **Score against the Checks table** and set a determination: **DISCLOSE (by <time>) / NOT MATERIAL** and **UPSI / NOT UPSI**, with the controls to apply.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Materiality mis-judged (both limbs not applied) | Deemed list + quantitative + qualitative tested | S1 | Re-run both limbs `[verify current]` |
| Disclosure timeline missed/miscomputed | Correct 30-min / 12-h / 24-h window from the trigger | S1 | Disclose now; the clock runs from the event `[verify current]` |
| Partial / selective / misleading disclosure | Accurate, complete, updated as facts develop | S1 | Correct/complete the disclosure |
| UPSI not separately assessed | PIT price-sensitivity tested independently of LODR | S1 | Run the UPSI test |
| Trading window not closed for UPSI | Window shut for designated persons + relatives | S1 | Close the window immediately |
| SDD not maintained / not time-stamped | UPSI + recipients logged, immutable, time-stamped | S1 | Log it in the structured digital database |
| Need-to-know breached | Legitimate-purpose + minimal sharing | S2 | Restrict access; record the purpose |
| Market-rumour duty ignored | Verification/response per the rumour framework | S2 | Assess the rumour-disclosure obligation `[verify current]` |
| Pre-clearance / contra-trade rules skipped | Designated-person trade controls applied | S2 | Apply pre-clearance + cooling-off |

## Output

Lead with `Determination: DISCLOSE by <time/date> | NOT MATERIAL — and — UPSI | NOT UPSI — <event>`. Then the output contract. Add:

- **Materiality**: deemed / quantitative / qualitative result, with the threshold applied.
- **Timeline**: the trigger time and the disclosure deadline.
- **UPSI & controls**: UPSI status, trading-window action, SDD entry, need-to-know.
- **Draft disclosure note** (where asked).
- One JSON finding per issue with `category: "listed-disclosure"`.

## Edge cases & pitfalls

- **LODR-material but not UPSI (and vice versa)**: the two tests overlap but aren't the same — run both; an event can be disclosable yet not UPSI, or UPSI before it's a LODR event.
- **Clock starts at the event, not the press release**: the 30-min/12-h/24-h windows run from the board decision/occurrence; drafting delay eats the window.
- **Window left open on UPSI**: letting designated persons trade while UPSI exists is the cardinal PIT breach — shut the window the moment UPSI arises.
- **SDD as an afterthought**: the structured digital database must be contemporaneous, immutable and time-stamped — reconstructing it later defeats its evidentiary purpose.
- **Developing-situation silence**: waiting for certainty can cross the deadline; disclose what's known and update.

## References

- Volatile facts: `IN-STMP-SEC-01` where securities-transfer stamp duty is in play; `IN-SECT-01` for SEBI cyber-incident reporting overlaps. SEBI LODR materiality thresholds, disclosure timelines, and the PIT/SDD and market-rumour frameworks are volatile — cite `[verify current]` on any load-bearing threshold or window.
- SEBI (LODR) Regulations Reg. 30 + Schedule III, SEBI (Prohibition of Insider Trading) Regulations, and the relevant SEBI circulars/FAQs.
