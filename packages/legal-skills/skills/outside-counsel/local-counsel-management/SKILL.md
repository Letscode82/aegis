---
name: outside-counsel-local-counsel-management
description: >-
  Coordinates local/foreign counsel across multiple jurisdictions on one matter: scoping each jurisdiction's role,
  instructing consistently, running a central matter spine (issues list, deadlines, privilege, document handling),
  reconciling conflicting local advice, and controlling cost/quality across the set. Use to instruct and run
  multi-jurisdiction counsel. Not for selecting the panel they come from → outside-counsel/panel-rfp; not for the
  comparative legal grid itself → research/multi-jurisdiction-survey.
module: outside-counsel
version: 1.0.0
jurisdictions: [global]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of plan (scope + instruct the multi-jurisdiction set), coordinate (run the live matter across counsel) or reconcile (resolve conflicting local advice into one client position).
  - name: matter
    required: false
    description: The matter, the jurisdictions involved and each one's role (lead, local filing, enforcement, advice), the deadlines, and which firm leads where.
  - name: constraints
    required: false
    description: Budget, privilege/confidentiality constraints, language/time-zone issues, and whether a lead counsel coordinates or the client does.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [outside-counsel/panel-rfp, outside-counsel/billing-guidelines, research/multi-jurisdiction-survey, disputes/arbitration-strategy, matters/matter-plan]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Local Counsel Coordination

Takes a multi-jurisdiction matter and returns a coordination plan that keeps many local firms pulling in one direction: each jurisdiction's role scoped, consistent instructions, a central spine for deadlines/privilege/documents, and a way to reconcile conflicting local advice. The deliverable is a run-the-matter coordination plan with the privilege and consistency traps flagged, not a list of firms.

## When to use / not use

- Use: instructing and running local/foreign counsel across several jurisdictions on one matter (a cross-border deal, dispute, investigation, or filing programme); keeping advice and strategy consistent; controlling cost and quality across the set.
- Hand off: selecting/tendering the firms → `outside-counsel/panel-rfp`; the pure comparative-law grid (without the instruct/coordinate layer) → `research/multi-jurisdiction-survey`; the arbitration-specific seat/enforcement strategy → `disputes/arbitration-strategy`; the overall matter plan/critical path → `matters/matter-plan`; the billing rules each firm must follow → `outside-counsel/billing-guidelines`.

## Inputs to collect first

1. The **matter** and the **jurisdictions** involved, with each one's **role** (lead advice, local filing, enforcement, litigation, regulatory).
2. Who **coordinates** — a lead counsel or the client's in-house team — and the reporting line.
3. The **deadlines** (often jurisdiction-specific and interdependent) and the **budget**.
4. **Privilege/confidentiality** constraints and practical factors (language, time zones).

## Method

1. **Scope each jurisdiction's role precisely.** Define what each local firm is (and is not) instructed to do; overlapping or gapped scopes waste money and leave holes. Decide where one jurisdiction leads and others support.
2. **Instruct consistently from one brief.** Issue a common instruction/question set so local answers are comparable and the strategy is coherent; avoid each firm running its own theory. Where comparison is the point, use `research/multi-jurisdiction-survey`'s fixed-column discipline.
3. **Run a central matter spine.** One owner holds the master issues list, the consolidated **deadline calendar** (with dependencies between jurisdictions), the document index, and the decision log → `matters/matter-plan`. Local firms feed the spine; they don't each keep their own version of the truth.
4. **Protect privilege across borders — carefully.** Privilege rules differ by jurisdiction (in-house privilege is limited or absent in some; common-interest/joint-defence privilege varies); route sensitive communications to preserve privilege and don't assume one country's protection travels `[verify current]`.
5. **Reconcile conflicting local advice.** When firms disagree or local law genuinely diverges, surface it, get the basis for each view, and resolve to a single **client position** (or an explicit per-jurisdiction split) rather than leaving the conflict unmanaged → `research/multi-jurisdiction-survey`.
6. **Control cost and quality consistently.** Apply the OCG/billing rules and budgets to every firm, watch for duplicated work across firms, and set a consistent quality bar and reporting format → `outside-counsel/billing-guidelines`.
7. **Manage the practical layer.** Time zones, language (and translation of key documents → `drafting/legal-translation`), local filing formalities, and who signs/files what where.
8. **Keep the client informed with one voice.** Consolidated status up to the client, not a dozen separate updates; the coordinator synthesises.
9. **Score against the Checks table** and output the coordination plan (roles, spine, privilege map, reconciliation) or the resolved position.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Overlapping / gapped jurisdiction scopes | Each role scoped; no gaps or duplication | S1 | Re-scope the set |
| Inconsistent instructions across firms | One common brief / question set | S2 | Instruct from a single brief |
| No central spine (deadlines/issues/docs) | One owner holds the master spine | S1 | Stand up the matter spine → matter-plan |
| Interdependent deadlines not mapped | Cross-jurisdiction dependencies tracked | S1 | Build the consolidated calendar |
| Privilege assumed to travel | Per-jurisdiction privilege routed deliberately | S1 | Map privilege; protect sensitive comms `[verify current]` |
| Conflicting local advice left unresolved | Reconciled to a client position or explicit split | S2 | Resolve the conflict |
| Cost/quality controls inconsistent | OCG + budget applied to all firms | S2 | Apply controls uniformly |
| Duplicated work across firms | Work allocation de-conflicted | S2 | Remove the overlap |
| Client gets fragmented updates | One consolidated status | S3 | Synthesise to one voice |

## Output

Lead with `Coordination: <matter> across <n jurisdictions> — lead: <firm/role> — key risk: <privilege/deadline/conflict>`. Then the output contract. Add:

- **Role map**: jurisdiction · firm · scope · lead/support.
- **Matter spine**: owner, consolidated deadlines (with dependencies), document index.
- **Privilege map**: how sensitive communications are routed per jurisdiction.
- **Reconciliation**: any conflicting advice and the resolved position.
- **Cost/quality**: the uniform controls applied.
- One JSON finding per coordination risk with `category: "local-counsel"`.

## Edge cases & pitfalls

- **Scope gaps and overlaps**: unclear roles leave a filing nobody owns or two firms billing the same work — scope each precisely.
- **Privilege doesn't travel**: assuming home-jurisdiction privilege protects a communication with foreign counsel can waive it — route sensitive comms deliberately.
- **Interdependent deadlines**: a filing in one country that depends on a step in another fails silently without a consolidated, dependency-aware calendar.
- **Unresolved divergence**: leaving two firms' conflicting advice on the table hands the client an unmanaged risk — reconcile to one position or an explicit split.
- **Twelve voices**: uncoordinated direct updates from every firm overwhelm the client and hide the throughline — the coordinator speaks once.

## References

- Volatile facts: cite `[verify current]` where a jurisdiction's privilege rule or local filing formality is load-bearing; use `research/multi-jurisdiction-survey` for the underlying comparative positions.
- Standard cross-border matter-coordination practice; per-jurisdiction privilege/conduct rules; the OCG/billing controls applied across the firm set.
