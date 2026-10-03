---
name: matters-lessons-learned
description: >-
  Runs a post-matter retrospective and turns it into reusable knowledge: what happened vs plan, what went well and
  badly and the root cause (not blame), and specific, owned, actionable improvements routed to where they'll be reused
  — a template fix, a playbook/checklist update, a risk to watch, a KB entry. Use to close out a matter or a phase
  with learning captured. Not for the live risk/issue tracker → matters/raid-log; not for department metrics →
  matters/legal-kpi-dashboard.
module: matters
version: 1.0.0
jurisdictions: [global]
risk_tier: self-serve
inputs:
  - name: mode
    required: true
    description: One of retrospective (run the review for a matter/phase) or synthesize (roll several matters' lessons into themes + reusable artefacts).
  - name: matter
    required: false
    description: The matter(s), the original plan/estimate vs outcome, the RAID log and key decisions, and the people involved.
  - name: focus
    required: false
    description: What the review should prioritise (cost/time overruns, a bad outcome, a process that worked well worth standardising).
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [matters/raid-log, matters/matter-plan, matters/legal-kpi-dashboard, contracts/contract-template-builder, matters/status-report]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Lessons Learned

Takes a finished matter (or several) and turns the retrospective into knowledge that actually gets reused: what happened against plan, root causes without blame, and specific owned improvements routed to the artefact that will carry them forward. The deliverable is a short retro plus concrete, assigned changes — not a feelings round that changes nothing.

## When to use / not use

- Use: closing out a matter or a major phase with learning captured; running a retrospective after a bad outcome or a notable success; rolling several matters' lessons into themes and reusable artefacts.
- Hand off: tracking live risks/issues/decisions during the matter → `matters/raid-log`; the original plan/estimate the retro compares against → `matters/matter-plan`; department-level metrics/trends → `matters/legal-kpi-dashboard`; turning a "fix the template" lesson into the actual template → `contracts/contract-template-builder`; the ongoing status narrative → `matters/status-report`.

## Inputs to collect first

1. The **matter(s)** and the **original plan/estimate** (scope, budget, timeline) to compare the outcome against.
2. The **RAID log** and the **key decisions** taken → `matters/raid-log`.
3. The **people involved** (for input, not blame).
4. The **focus** — overruns, a bad result, or a success worth standardising.

## Method

1. **Compare outcome to plan.** Scope, cost, timeline, and result vs the original `matters/matter-plan` and estimate — the gaps are where the lessons live. Be specific and factual, not impressionistic.
2. **Capture what went well *and* badly.** Retros that only hunt failures miss the practices worth standardising; capture both, with concrete examples.
3. **Find the root cause, not the culprit.** For each notable gap, ask why to the underlying cause (process, information, resourcing, assumption) — keep it **blameless** so people contribute honestly; a blame exercise produces defensive silence and no learning.
4. **Separate luck from skill.** A good outcome from a bad process (or vice versa) is the dangerous case — judge the process, so you don't standardise a practice that just got lucky.
5. **Turn each lesson into a specific, owned action.** A lesson with no action is a diary entry. For each, write the concrete change, an **owner**, and a due date — and route it to where it'll be reused: a **template/clause fix** → `contracts/contract-template-builder`, a **checklist/playbook update**, a **risk to watch** on future matters, or a **KB entry**.
6. **Make it findable and reusable.** Tag the lessons so the next similar matter actually surfaces them; a lesson filed where no one looks is lost. Feed recurring themes into the standard artefacts rather than leaving them as per-matter notes.
7. **(Synthesize mode)** roll multiple matters' lessons into **themes**, spot the systemic patterns (the same overrun cause recurring), and propose the structural fix rather than N separate notes.
8. **Keep it short and honest.** A tight retro people will read beats a long one they won't; don't sand off the uncomfortable finding — that's usually the valuable one.
9. **Score against the Checks table** and output the retro + the assigned action list (or the synthesized themes + structural fixes).

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| No comparison to plan/estimate | Outcome measured against the original plan | S2 | Add the plan-vs-actual |
| Only failures (or only wins) captured | Both good and bad practices captured | S2 | Capture the other side |
| Stops at symptom, no root cause | Root cause (blameless) identified | S1 | Ask why to the cause |
| Blame instead of process focus | Blameless framing; process not people | S1 | Reframe to the process |
| Luck vs skill not separated | Process judged independent of outcome | S2 | Assess the process on its merits |
| Lessons with no action/owner | Specific change + owner + date | S1 | Assign owned actions |
| Actions not routed to a reuse artefact | Template/checklist/KB/risk updated | S2 | Route each action to where it's reused |
| Lessons not tagged/findable | Tagged so future matters surface them | S2 | Make them findable |
| (Synthesize) N notes, no theme | Systemic patterns + structural fix | S3 | Roll up into themes |

## Output

Lead with `Retro: <matter> — <n lessons, n owned actions> — top fix: <the one that matters most>`. Then the output contract. Add:

- **Plan vs actual**: scope/cost/timeline/result against the original.
- **What worked / what didn't**: with concrete examples and root causes.
- **Action list**: each lesson → specific change · owner · due date · reuse artefact.
- **(Synthesize)** themes across matters + the structural fix.
- One JSON finding per actionable lesson with `category: "lessons-learned"`.

## Edge cases & pitfalls

- **Blame round**: the moment a retro becomes about who to blame, honest input stops and the real cause stays hidden — keep it blameless.
- **No owner, no reuse**: lessons with no owner, due date, or home artefact evaporate — the value is in the assigned, routed action.
- **Standardising luck**: treating a good outcome as proof the process was good can entrench a risky practice — judge the process, not just the result.
- **Only-failures retro**: ignoring what went well loses the practices worth making standard.
- **Filed-and-forgotten**: a lesson stored where the next matter won't find it is lost — tag it and feed it into the standard artefacts.

## References

- Volatile facts: none; this is a knowledge-capture discipline.
- Standard blameless-retrospective practice; the matter's own plan, RAID log, and decisions; the house templates/checklists/KB that lessons feed back into.
