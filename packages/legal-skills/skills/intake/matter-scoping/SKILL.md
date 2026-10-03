---
name: intake-matter-scoping
description: >-
  Turns a triaged request into a defined matter scope: the objective and deliverables, what is in and explicitly out
  of scope, the assumptions and dependencies, the stated risks, and a realistic effort/sequencing estimate — so the
  work is bounded before it starts. Use after triage, before opening/resourcing a matter. Not for the initial
  routing/prioritisation of the request → intake/request-triage; not for the full work plan and critical path →
  matters/matter-plan.
module: intake
version: 1.0.0
jurisdictions: [global]
risk_tier: review-required
inputs:
  - name: request
    required: true
    description: The triaged request — what the requester wants, the business context, the desired outcome and any deadline.
  - name: constraints
    required: false
    description: Budget/resourcing limits, the deadline, who the stakeholders are, and any fixed-fee or external-counsel considerations.
  - name: context
    required: false
    description: Related prior matters, known dependencies (on other teams, data, or decisions), and the risk appetite.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [intake/request-triage, intake/conflict-check-prep, matters/matter-plan, outside-counsel/matter-budget, matters/raid-log]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Matter Scoping

Takes a triaged request and returns a bounded scope: the objective, the deliverables, the explicit in/out lines, the assumptions and dependencies, and an effort estimate — so everyone agrees what the matter is before work (and cost) begins. The deliverable is a scope statement that can be signed off, not a restatement of the request.

## When to use / not use

- Use: after a request is triaged and accepted, to define what the matter will and won't deliver; before resourcing, budgeting, or instructing external counsel; to reset scope when a matter has drifted.
- Hand off: the initial intake routing, prioritisation and urgency call → `intake/request-triage`; the conflicts check before opening → `intake/conflict-check-prep`; the detailed work plan, tasks and critical path once scope is agreed → `matters/matter-plan`; the cost/fee forecast → `outside-counsel/matter-budget`; tracking risks/assumptions/decisions as the matter runs → `matters/raid-log`.

## Inputs to collect first

1. The **objective** — the business outcome the requester actually wants (not just the task they asked for).
2. The **deadline** and any fixed budget/resourcing or fee constraint.
3. The **stakeholders** and who signs off the scope.
4. Known **dependencies** (other teams, data, prior decisions) and related prior matters.

## Method

1. **State the objective in outcome terms.** Write what success looks like for the business, not the activity — "get the vendor deal signable by month-end" rather than "review a contract". The objective disciplines everything below it.
2. **List the deliverables concretely.** The specific outputs (a reviewed-and-redlined contract, an opinion, a filing, a policy) with enough definition that "done" is unambiguous.
3. **Draw the in/out-of-scope lines explicitly.** What the matter will do **and** what it deliberately will not — the out-of-scope list prevents the most common failure, silent scope creep. Note what's deferred to a later phase.
4. **Record assumptions and dependencies.** The facts taken as true (and who must confirm them) and the things the matter relies on from others; each assumption is a risk if wrong → track in `matters/raid-log`.
5. **Surface the risks and unknowns.** The legal/commercial risks the matter carries and the open questions that could change scope — flag the ones that must be resolved before committing.
6. **Estimate effort and sequencing.** A realistic effort band and the rough phase sequence, with the main drivers of cost/time. Where a fixed fee or budget is set, state what that buys and what would be a change of scope → `outside-counsel/matter-budget`.
7. **Identify the change-control line.** State what counts as a scope change (triggering re-scoping/re-pricing) so later "can you also…" requests are handled explicitly, not absorbed.
8. **Get it bounded and signed off.** The scope statement is for agreement with the requester/stakeholders — ambiguity resolved **before** work starts, not discovered mid-matter.
9. **Score against the Checks table** and output a scope statement ready for sign-off.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Objective stated as activity, not outcome | Business outcome defined | S2 | Re-state in outcome terms |
| Deliverables vague / "done" ambiguous | Concrete, testable deliverables listed | S2 | Define each deliverable |
| No explicit out-of-scope list | In- and out-of-scope both stated | S1 | Add the exclusions |
| Assumptions/dependencies unrecorded | Each assumption + dependency captured with owner | S2 | List them → raid-log |
| Risks / open questions not surfaced | Scope-affecting risks flagged | S2 | Surface the unknowns |
| No effort/sequencing estimate | Realistic effort band + phases | S2 | Add the estimate |
| Fixed fee/budget without a scope boundary | What the fee buys + change line stated | S2 | Define the change-control line |
| No sign-off / agreement step | Scope agreed before work starts | S2 | Route for sign-off |
| Silent scope creep absorbed | Changes handled via change control | S3 | Re-scope/re-price on change |

## Output

Lead with `Scope: <matter> — objective: <outcome> — effort: <band>`. Then the output contract. Add:

- **Objective & deliverables**: the outcome and the concrete outputs.
- **In / out of scope**: the explicit boundary, with deferrals noted.
- **Assumptions & dependencies**: each with its owner/confirmer.
- **Risks & open questions**: the scope-affecting unknowns.
- **Estimate & change control**: effort/sequencing and what counts as a change.
- One JSON finding per material risk/assumption with `category: "matter-scoping"`.

## Edge cases & pitfalls

- **Activity vs outcome**: scoping to the task the requester named rather than the outcome they need produces the wrong deliverables — anchor on the objective.
- **No out-of-scope list**: the exclusions are what hold the line; without them, every adjacent "while you're at it" quietly expands the matter.
- **Unstated assumptions**: a scope built on unverified assumptions collapses when one proves false — record and assign them.
- **Fixed fee, fuzzy scope**: agreeing a fixed fee without a scope boundary and change-control line is how matters lose money — define the change line up front.
- **Skipping sign-off**: starting work on an unagreed scope guarantees a later "that's not what I asked for" — bound it and get agreement first.

## References

- Volatile facts: generally none; cite `[verify current]` only where a scope assumption rests on a dated legal position.
- The triaged request and the requester's stated outcome; standard matter-scoping / statement-of-work practice; the firm's change-control and fee conventions.
