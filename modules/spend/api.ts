/**
 * @aegis/spend — Legal Spend & Outside-Counsel Management.
 *
 * PUBLIC SURFACE. The only file other modules and the app may import
 * from. Internal services, the review engine's wiring, and UI live under
 * `src/internal` / `src/ui` and are private (module-isolation rule).
 *
 * Scope (Foundation plan PR #6 — "Spend & Counsel", clubbed): outside-
 * counsel master data (firm = Counterparty, timekeeper = Person, rate
 * cards), e-billing invoice review (deterministic + AI-judgment rules
 * behind the AgentDecision gate), review & short-pay workflow, budgets,
 * and GC spend analytics. See docs/spend-module-plan.md.
 *
 * SP-1 ships the review rule engine (pure, unit-tested). HTTP routes,
 * the Spend dashboard, and the DB-backed review/short-pay mutations land
 * in SP-2 / SP-3.
 */
export {
  runInvoiceReview,
  DEFAULT_GUIDELINES,
  type ReviewLineItem,
  type ReviewContext,
  type ReviewGuidelines,
  type ReviewResult,
  type ReviewFlag,
  type FlagCode,
  type FlagSeverity,
} from "./src/internal/review/rules";

export {
  getSpendOverview,
  type SpendOverview,
  type SpendFirmSummary,
  type SpendInvoiceSummary,
  type SpendBudgetSummary,
} from "./src/internal/reads";

export {
  getInvoiceDetail,
  runAndPersistReview,
  approveInvoice,
  rejectInvoice,
  type InvoiceDetail,
  type InvoiceDetailLine,
} from "./src/internal/review/service";
