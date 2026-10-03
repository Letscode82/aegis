---
name: matters-stakeholder-comms
description: >-
  Builds a stakeholder communication plan for a legal matter or project: who needs to know what and when, the
  message per audience (board, execs, business owners, employees, regulators, external parties), cadence and
  channels, privilege and confidentiality guardrails, escalation triggers, and holding lines for the sensitive cases.
  Use to plan comms for a dispute, investigation, deal, incident or programme. Not for the matter's task plan →
  matters/matter-plan; not for a regulator-facing response → disputes/regulatory-investigation.
module: matters
version: 1.0.0
jurisdictions: [global]
risk_tier: review-required
inputs:
  - name: matter
    required: true
    description: The matter/project, its sensitivity (routine / confidential / privileged / crisis), and the outcome the comms must support.
  - name: stakeholders
    required: false
    description: Who has an interest — board, execs, business owners, affected employees, regulators, counterparties, customers, external counsel — and their information needs and influence.
  - name: constraints
    required: false
    description: Privilege/confidentiality limits, disclosure obligations (listed-company, regulatory), and any embargo or sequencing requirement.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [matters/matter-plan, matters/status-report, disputes/regulatory-investigation, privacy/breach-response, corporate/listed-company-disclosure, matters/raid-log]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Stakeholder Communication Plan

Produces a communication plan that gets the right message to the right stakeholder at the right time without waiving privilege, breaching confidentiality, or tripping a disclosure obligation. The deliverable is an audience-by-audience plan with messages, cadence, guardrails and escalation triggers — not a generic comms template.

## When to use / not use

- Use: planning communications around a dispute, investigation, transaction, incident, or legal programme; building holding lines for a sensitive or crisis matter; aligning who-tells-whom-when across a cross-functional matter.
- Hand off: the matter's task/milestone plan → `matters/matter-plan`; a recurring status update → `matters/status-report`; the regulator-facing response itself → `disputes/regulatory-investigation`; a privacy-breach notification plan → `privacy/breach-response`; a listed-company disclosure assessment → `corporate/listed-company-disclosure`.

## Inputs to collect first

1. The matter, its sensitivity tier, and the outcome the communications must support.
2. The stakeholder map: who has an interest, their information need, and their influence/decision rights.
3. Constraints: privilege, confidentiality, disclosure duties, embargoes, and any required sequencing.
4. Known trigger points (a filing, a finding, a decision, a leak risk) that will force communication.

## Method

1. **Classify sensitivity first** — routine / confidential / privileged / crisis. The tier sets the default posture: routine comms flow freely; privileged matters communicate narrowly and carefully; crisis matters need pre-agreed holding lines and a single spokesperson.
2. **Map stakeholders by information-need and influence.** For each: what they must know, what they want to know, what they must *not* be told (yet), their decision rights, and the risk if they hear it elsewhere first.
3. **Protect privilege in the comms design.** Widening the circle can waive legal privilege; mark which communications are privileged, keep them within the privileged group, label appropriately, and route sensitive substance through counsel. Flag any planned communication that would breach privilege.
4. **Check disclosure and sequencing obligations.** Listed-company inside-information duties, regulatory notification timings, and contractual notice requirements can dictate *when* and *to whom* — and can make silence or mis-sequencing unlawful → `corporate/listed-company-disclosure`, `privacy/breach-response`.
5. **Draft the message per audience** — plain, accurate, consistent, and scoped to that audience's need. One set of facts, differently framed; never contradictory messages to different audiences (they compare notes).
6. **Set cadence and channels** — who updates whom, how often, through what channel, and who owns each thread. Over-communication to the board erodes signal; under-communication to affected employees breeds rumour.
7. **Define escalation triggers** — the events that force an immediate, pre-planned communication (a material adverse finding, a leak, a regulator contact, a settlement). Pre-write the holding line for each.
8. **Name the single source of truth and spokesperson** for sensitive matters, so the organisation speaks with one voice and off-message freelancing is contained.
9. **Plan for leaks and the external audience** where relevant — media, customers, counterparties — with approved holding statements, not improvised reactions.
10. **Score against the Checks table** and set a decision: **READY / READY WITH CONDITIONS / NOT READY**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| A planned communication would waive privilege | Privileged substance kept in the privileged circle | S1 | Remove/reroute via counsel; re-scope the audience |
| Disclosure obligation missed or mis-sequenced | Timing/recipients mapped to the legal duty | S1 | Align to the obligation → relevant disclosure skill |
| Contradictory messages to different audiences | One fact base, consistent framing | S2 | Reconcile; single source of truth |
| No spokesperson / single voice for a sensitive matter | Named spokesperson + message discipline | S2 | Appoint; brief everyone else to defer |
| No escalation triggers or holding lines | Triggers defined + holding lines pre-written | S2 | Draft triggers + holding statements |
| Affected employees/parties left uninformed | Need-to-know audiences covered + protected | S3 | Add the audience; plan retaliation-safe comms |
| Over-/under-communication cadence | Cadence matched to each audience's need | S3 | Right-size the cadence |
| Confidential matter on an insecure/over-broad channel | Channel matches the sensitivity tier | S2 | Move to an appropriate channel + circle |

## Output

Lead with `Status: READY | READY WITH CONDITIONS | NOT READY — <matter> — <key reason>`. Then the output contract. Add:

- **Sensitivity tier** and the posture it sets.
- **Stakeholder comms matrix**: audience · what they're told · what they're not · owner · channel · cadence.
- **Guardrails**: privilege lines, disclosure/sequencing duties, single spokesperson.
- **Escalation triggers + holding lines**: event → the pre-agreed message.
- One JSON finding per gap with `category: "stakeholder-comms"`.

## Edge cases & pitfalls

- **Privilege waiver by distribution**: forwarding privileged advice to a wide internal list can waive it — the convenience is rarely worth the loss.
- **Silence as a breach**: for listed companies and some regulated matters, *not* communicating in time is itself the violation — comms planning includes mandatory disclosures.
- **Mixed messages**: audiences talk to each other; inconsistent framing reads as either confusion or concealment.
- **The leak you didn't plan for**: without a pre-written holding line, the first reaction is usually the wrong one — pre-draft for the plausible leak.
- **Board fatigue vs business starvation**: calibrate — the board needs signal and decisions, affected employees need clarity and reassurance; the same cadence rarely fits both.

## References

- Volatile facts: cite live where a disclosure-timing duty is load-bearing; mark `[verify current]`.
- Legal-privilege and confidentiality principles; listed-company inside-information/disclosure regimes; crisis-communication practice (single-voice, holding-line discipline).
