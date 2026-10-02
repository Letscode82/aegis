# AEGIS Severity Scale

One scale for every skill, so findings from contract review, privacy, disputes and vendor checks can be compared and rolled up on the Risk Graph.

| Level | Label | Meaning | Default handling |
|---|---|---|---|
| **S1** | Critical | Could cause regulatory breach, uncapped or existential liability, loss of a key right, criminal exposure, or a missed non-extendable deadline. | Stop. Escalate to named lawyer. Do not sign / proceed. |
| **S2** | High | Material financial, operational or reputational exposure; clear departure from mandatory policy. | Must be fixed or formally accepted by an approver with authority. |
| **S3** | Medium | Departure from preferred position with a manageable downside. | Negotiate; acceptable with documented rationale. |
| **S4** | Low | Drafting, clarity or minor commercial point. | Fix if cheap; otherwise note. |
| **Info** | Note | Observation with no action needed. | None. |

## When likelihood matters

For risk registers, disputes and compliance assessments, combine impact (S-level) with likelihood:

| Likelihood ↓ / Impact → | S1 | S2 | S3 | S4 |
|---|---|---|---|---|
| **Likely** (>50%, or already occurring) | Red | Red | Amber | Green |
| **Possible** (10–50%) | Red | Amber | Amber | Green |
| **Remote** (<10%) | Amber | Amber | Green | Green |

State the reason for each likelihood call in one line. If you cannot estimate likelihood, say so and use **Possible**.

## Calibration rules

- Severity reflects the exposure **to our organisation** in the role we play (buyer, seller, controller, processor, employer, claimant…). Re-check the role before scoring.
- A missing protection is scored by what happens without it, not by how common it is.
- Do not inflate: an S1 must name the specific harm. If you cannot, it is S2 or lower.
- Aggregation: a document's overall rating is its highest finding, unless three or more S2s affect the same risk area, which rolls up to S1 for that area.
