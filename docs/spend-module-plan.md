# Legal Spend & Outside-Counsel Management — module plan

Research-backed design for the AEGIS `modules/spend` module (Foundation
plan PR #6). Synthesised from a four-agent research swarm covering
**BrightFlag**, **Mitratech TeamConnect**, **SimpleLegal**, plus a
domain best-practices pass. Full agent reports are in the session
transcript.

## Decision: one clubbed module

**`modules/spend` = "Legal Spend & Outside-Counsel Management".** Spend
and outside-counsel management are two views of one entity graph — the
firm is a `Counterparty`, the timekeeper a `Person`, and invoices,
budgets, rate cards, accruals and scorecards all hang off the shared
`Matter`. Rate cards authored on the counsel side are the exact
reference the invoice-review engine checks; firm scorecards are analytic
rollups of invoice adjustments. Splitting them would fragment one
workflow across an artificial `api.ts` seam **and require a forbidden
12th module** (CLAUDE.md non-negotiable #1). They are clubbed.

Internal sub-domains under `src/internal/`: `ebilling/` (LEDES + UTBMS),
`review/` (rule engine + AgentDecision), `budget/` (budgets + accruals),
`firms/` (master data, rate cards, panels, scorecards, diversity),
`workflow/` (approval + short-pay + AP export), `analytics/`. One
public `api.ts`.

## What the market does (convergent flagship features)

Every incumbent leads with the **same** core, so AEGIS must too:

| Feature | BrightFlag | TeamConnect | SimpleLegal |
|---|---|---|---|
| AI line-item invoice review | ML+GenAI (10yr) | ARIES / Invoice IQ | SimpleReview ($16B) |
| Billing-guideline enforcement | ✓ | ✓ | ✓ (at submission) |
| Rate-card / timekeeper validation | ✓ | pre-approval | ✓ |
| Budgets + accruals automation | ✓ | Collaborati | ✓ |
| Spend analytics dashboards | ✓ (con: rigid) | ✓ | ✓ (con: ~1yr) |
| NL spend query assistant | Ask BrightFlag | ARIES | — |
| Outside-counsel scorecards | ✓ | ✓ | ✓ |
| DEI / diversity tracking | ✓ | partial | ✓ |
| AP/ERP + SSO integration | SAP/Okta | API/SAML | SAP/NetSuite/Workday |

**AEGIS's edge:** TeamConnect is criticised for complexity/dated UX;
SimpleLegal hits a mid-market ceiling and thin reporting. AEGIS wins on
a **clean, AI-native surface** with **conservative-AI governance baked
in** (every short-pay is an `AgentDecision`-gated, chain-sealed action —
the "one brain" + defensibility story no incumbent tells).

## Governance mapping (the AEGIS differentiator)

- **Deterministic rules** (math, rate-over-card, unapproved timekeeper,
  duplicate, out-of-period, over-budget, non-billable expense) auto-flag
  and write an `AuditLog` row; they may auto-short-pay only where the
  billing guideline authorises it.
- **AI-judgment rules** (block-billing, vague narrative, task-to-time
  reasonableness) each write an **`AgentDecision` PENDING** row; the
  reviewer's approve keystroke is the only path to APPROVED, and the
  short-pay mutation gates on APPROVED — the exact 4b/P2b contract Spend
  inherits, not reinvents.
- Every state change (received → in-review → adjusted → approved →
  appealed → paid) twin-records to the timeline + chain-sealed
  `AuditLog`, like matter/legal-hold.

## Standards to model

- **LEDES**: ingest **1998B + 1998BI** first (covers the vast majority);
  keep the parser an adapter behind a normalized `Invoice` /
  `InvoiceLineItem` shape so LEDES XML 2.0/2.1 maps later. Verify exact
  1998B field order at implementation (ledes.org) — do not hardcode.
- **UTBMS**: task sets **L/C/P/IP/B**, universal **A**-activity codes,
  **E**-expense codes. Store `code` + `codeSet`; validate membership
  against a seeded reference table; missing/mismatched code is itself a
  review rule.

## Existing foundation (already in the repo)

- **Schema**: `Vendor` (firm↔`Counterparty`, `ratesCard` JSON,
  `performanceScore`), `Invoice` (LEDES payload, SUBMITTED→…→PAID,
  approvedBy), `InvoiceLineItem` (`status` PENDING/FLAGGED/ACCEPTED/
  REDUCED, `flaggedReason`, timekeeper), `Budget` (MATTER/DEPARTMENT/
  ANNUAL, allocated vs spent), `Timekeeper` (`Person` external-counsel,
  `defaultRate`). **The MVP review + short-pay spine needs no
  migration** — the line-item status/flag fields already exist.
- **Permissions**: `spend:read_all`, `spend:read_matter_budget`,
  `spend:approve_invoice`, `spend:reject_invoice` — defined.
- **Nav**: `spend` (Legal Spend) + `ocm` (Outside Counsel) tiles exist.
- **Seed §5**: 3 firms (Skadden, Cleary, Axiom) with rate cards, 4
  timekeepers, 6 invoices on the Snowflake matter, 2 budgets.
- **Seam**: `matter/internal/services/cross-module.ts:getMatterCostBasisService`
  is the documented stub to sunset — Spend's `api.ts` exposes
  `getMatterSpendSummary(matterId)` in its place.

## MVP demo spine — *"an invoice arrives → gets scrubbed → gets short-paid → the GC sees the savings"*

1. LEDES 1998B/BI ingest → normalized invoice + line items, UTBMS
   validation.
2. Firm & timekeeper master + effective-dated rate cards on shared
   entities.
3. Deterministic review rules (math, rate-over-card, unapproved
   timekeeper, duplicate, out-of-period, over-budget, non-billable).
4. 1–2 AI-judgment rules (block-billing, vague narrative) via the
   `AgentDecision` gate.
5. Review & short-pay workflow — accept/reduce flags → approved amount +
   structured reason codes → chain-sealed audit + timeline.
6. Matter/phase budget + budget-vs-actual with variance.
7. GC analytics dashboard — spend by firm/matter/practice, savings /
   reduction rate, budget accuracy, cycle time (read-aggregation, gated
   like `/api/ai-ops`).
8. Seed line items (one clean invoice + several with planted violations)
   so the demo walks end-to-end.

## Build sequence (one PR per step, demo works at each)

- **SP-1 — Module foundation + deterministic review engine.** Scaffold
  `modules/spend` (internal/ui/api.ts). Pure, unit-tested rule engine
  (`review/rules.ts`) over the existing schema. Read services
  (`reads.ts`). No migration.
- **SP-2 — HTTP routes + Spend & Counsel dashboard.** `/api/spend/*`
  (permission-gated), Spend dashboard UI replacing the placeholder view:
  invoice queue, invoice detail with flagged lines, budget-vs-actual,
  spend-by-firm. Read + run-review.
- **SP-3 — Review & short-pay workflow (mutations).** accept/reduce/
  approve/reject → chain-sealed audit + timeline; sunset
  `getMatterCostBasisService`. Seed line items with planted violations.
- **SP-4 — AI-judgment agent.** block-billing + vague-narrative via
  `@aegis/ai`, each writing an `AgentDecision` PENDING row; short-pay
  gates on APPROVED.
- **SP-5 — Outside-counsel management.** Rate-card CRUD + rate-increase
  approval, timekeeper roster, firm scorecards.
- **SP-6 — GC analytics dashboard.** KPI aggregation, savings/realization,
  benchmarking; NL spend query (post-MVP).
- **Post-MVP:** accrual cycle, panels/RFP, DEI (consent-gated, tenant-
  toggleable), firm appeals, AP/ERP export, LEDES XML, forecasting.
