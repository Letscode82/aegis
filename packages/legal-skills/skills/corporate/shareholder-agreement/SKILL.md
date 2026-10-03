---
name: corporate-shareholder-agreement
description: >-
  Drafts or reviews a shareholders'/founders' agreement: control and board rights, reserved matters/veto, share
  transfer restrictions (ROFR/ROFO, tag/drag, lock-in), founder vesting and leaver provisions, anti-dilution and
  issue of new shares, exit/liquidity (IPO, sale, buy-back), deadlock resolution, and consistency with the articles.
  Use to paper or assess an SHA/founders' terms. Not for the financing-round economics of a term sheet alone; not for
  the board-meeting mechanics → corporate/board-minutes-resolutions.
module: corporate
version: 1.0.0
jurisdictions: [global, IN]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of draft (produce an SHA / founders' agreement), review (assess a draft or the other side's) or term-check (confirm a specific right works — e.g. drag, veto, vesting).
  - name: deal
    required: false
    description: The company, the shareholders and their stakes, the investor/founder dynamic, and the key commercial terms agreed (control, transfers, exit, vesting).
  - name: documents
    required: false
    description: Any existing SHA/articles/term sheet, the cap table, and the governing law.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [corporate/board-minutes-resolutions, corporate/corporate-governance-review, corporate/fdi-fema-assessment, contracts/contract-review, corporate/ma-due-diligence]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Shareholders' & Founders' Agreements

Takes an agreed (or proposed) shareholder deal and returns an SHA/founders' agreement that allocates control, transfers, vesting and exit cleanly — and actually works against the company's articles and governing law. The deliverable is a drafted/reviewed agreement with the control, transfer and enforceability traps flagged, not a boilerplate SHA.

## When to use / not use

- Use: drafting or reviewing an SHA or founders' agreement; stress-testing a specific right (drag-along, veto, vesting, pre-emption); aligning an SHA with the articles; papering a financing round's governance/transfer terms.
- Hand off: the board-meeting/resolution mechanics the SHA references → `corporate/board-minutes-resolutions`; the broader governance-structure review → `corporate/corporate-governance-review`; FEMA/FDI constraints on a foreign investor's rights/transfers → `corporate/fdi-fema-assessment`; a general commercial-contract review of ancillary agreements → `contracts/contract-review`; acquisition-driven share transfers at deal scale → `corporate/ma-due-diligence`.

## Inputs to collect first

1. The **cap table** and the shareholders (founders, investors, ESOP pool) with stakes.
2. The **agreed commercial terms**: control/board composition, reserved matters, transfer restrictions, exit, vesting.
3. The **articles of association** (the SHA must be consistent with, and often reflected in, them) and the governing law.
4. Any **term sheet** the SHA implements and the investor/founder dynamic (control vs protection).

## Method

1. **Allocate control and board rights.** Board composition and appointment rights, chair/casting vote, and **reserved matters / investor veto** (the list of decisions needing special consent) — calibrate the veto list to protection without paralysing the company.
2. **Set transfer restrictions.** **Lock-in/vesting** periods, **right of first refusal/offer (ROFR/ROFO)**, **tag-along** (minority can join a sale) and **drag-along** (majority can force a sale) with their thresholds and mechanics — these are the most-litigated clauses; define trigger, price and process precisely.
3. **Handle founder vesting and leavers.** Vesting schedule (cliff + vesting), and **good-leaver/bad-leaver** treatment of unvested (and sometimes vested) shares — the single biggest founder-dispute source; define the leaver categories and the buy-back price mechanism.
4. **Address new issues and anti-dilution.** Pre-emption rights on new shares, the ESOP pool, and any **anti-dilution** protection (full-ratchet vs broad-based weighted-average) — state the mechanism, not just the label.
5. **Plan exit and liquidity.** IPO cooperation, sale/trade-exit mechanics, buy-back/put-call options, and any liquidation-preference interaction — so the end-state is agreed, not improvised.
6. **Build deadlock resolution.** For 50/50 or veto-heavy structures, a real deadlock mechanism (escalation, casting vote, buy-sell/"Russian roulette"/Texas shoot-out, or exit) — absence of one is a time-bomb.
7. **Reconcile with the articles and law.** Where a term must bind third parties or the company, it usually has to be in the **articles** (an SHA binds only the parties); check enforceability of drag/transfer restrictions and any statutory limits (e.g. restrictions on private-company share transfers, FEMA pricing/transfer limits for foreign holders) `[verify current]`.
8. **Check consistency and survival.** Governing law, dispute resolution → `contracts/dispute-resolution-clause`, confidentiality, and that defined terms/cross-references are coherent.
9. **Score against the Checks table** and set a verdict: **SOUND / FIXES NEEDED / NOT ENFORCEABLE AS DRAFTED**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Veto/reserved-matters list over- or under-broad | Protection calibrated; company not paralysed | S2 | Re-scope the veto list |
| Transfer restrictions (ROFR/tag/drag) ill-defined | Trigger, price, process precise | S1 | Define the mechanics fully |
| Founder vesting / leaver terms missing or vague | Vesting + good/bad-leaver + buy-back price | S1 | Add leaver mechanics |
| Anti-dilution labelled, not specified | Mechanism (ratchet vs weighted-average) stated | S2 | Specify the formula |
| Exit / liquidity not papered | IPO/sale/buy-back mechanics agreed | S2 | Add exit provisions |
| No deadlock resolution | Real deadlock mechanism for veto/50-50 | S1 | Add a deadlock route |
| SHA term that needs the articles isn't in them | Third-party/company-binding terms in articles | S1 | Reflect in the articles `[verify current]` |
| Statutory/FEMA transfer limits ignored | Transfer/pricing limits respected | S2 | Comply with the limits → fdi-fema-assessment |
| Inconsistent definitions / dispute clause | Coherent defined terms + DR clause | S2 | Reconcile the drafting |

## Output

Lead with `Verdict: SOUND | FIXES NEEDED | NOT ENFORCEABLE AS DRAFTED — <company> — <key issue>`. Then the output contract. Add:

- **Control**: board rights + reserved-matters/veto list.
- **Transfers**: lock-in · ROFR/ROFO · tag · drag (with thresholds/mechanics).
- **Founders**: vesting + good/bad-leaver + buy-back price.
- **Economics & exit**: pre-emption/anti-dilution + exit/liquidity + deadlock.
- **Articles/law fit**: what must move into the articles + statutory limits.
- One JSON finding per issue with `category: "sha"`.

## Edge cases & pitfalls

- **SHA vs articles**: an SHA binds only its parties — a drag-along or transfer restriction that must bind the company or future shareholders usually has to be in the **articles**, or it fails when it matters.
- **Vague drag/tag triggers**: ill-defined thresholds, price basis, or process on drag/tag clauses are the most litigated terms — pin every mechanic.
- **Leaver landmine**: no good/bad-leaver treatment (or an unclear buy-back price) turns a founder exit into a valuation war — define it up front.
- **No deadlock route**: a 50/50 or veto-heavy SHA with no deadlock mechanism can freeze the company — build the exit before it's needed.
- **Statutory/FEMA limits**: private-company transfer restrictions and FEMA pricing/transfer rules can override a clause for a foreign holder — check before relying on it.

## References

- Volatile facts: cite `[verify current]` where a share-transfer restriction's enforceability, a FEMA pricing/transfer limit, or a stamping requirement is load-bearing; `IN-STMP-SEC-01` for securities-transfer stamp duty.
- The governing company law on share transfers and articles (e.g. Companies Act 2013 in India), FEMA for foreign shareholders, and standard SHA/VC term conventions.
