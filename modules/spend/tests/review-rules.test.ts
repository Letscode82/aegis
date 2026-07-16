import { describe, it, expect } from "vitest";
import { runInvoiceReview, type ReviewContext, type ReviewLineItem } from "../src/internal/review/rules";

const ctx = (over: Partial<ReviewContext> = {}): ReviewContext => ({
  invoiceId: "inv-1",
  currency: "USD",
  periodStart: "2026-06-01",
  periodEnd: "2026-06-30",
  approvedRateByTimekeeper: { "tk-partner": 1000, "tk-assoc": 500 },
  approvedTimekeeperIds: ["tk-partner", "tk-assoc"],
  budgetRemaining: 100000,
  ...over,
});

const line = (over: Partial<ReviewLineItem> = {}): ReviewLineItem => ({
  id: "l1",
  timekeeperId: "tk-partner",
  timekeeperName: "Partner",
  hours: 2,
  rate: 1000,
  amount: 2000,
  description: "Draft motion to dismiss and supporting brief section II",
  date: "2026-06-10",
  ...over,
});

const codes = (lines: ReviewLineItem[], c = ctx()) => runInvoiceReview(lines, c).flags.map((f) => f.code);

describe("invoice review rule engine", () => {
  it("a clean line raises no flags", () => {
    expect(codes([line()])).toEqual([]);
  });

  it("MATH_ERROR: billed amount ≠ hours × rate, reduces to the correct amount", () => {
    const r = runInvoiceReview([line({ amount: 2500 })], ctx());
    expect(r.flags.map((f) => f.code)).toContain("MATH_ERROR");
    expect(r.proposedShortPay).toBe(500);
    expect(r.proposedApprovedAmount).toBe(2000);
  });

  it("RATE_OVER_CARD: reduces by the overage × hours", () => {
    const r = runInvoiceReview([line({ rate: 1200, amount: 2400 })], ctx());
    const f = r.flags.find((x) => x.code === "RATE_OVER_CARD")!;
    expect(f.proposedReduction).toBe(400); // (1200-1000) × 2
    expect(f.severity).toBe("deterministic");
  });

  it("UNAPPROVED_TIMEKEEPER: biller off the roster is flagged and fully reduced", () => {
    const r = runInvoiceReview([line({ timekeeperId: "tk-ghost", timekeeperName: "Ghost" })], ctx());
    const f = r.flags.find((x) => x.code === "UNAPPROVED_TIMEKEEPER")!;
    expect(f.proposedReduction).toBe(2000);
  });

  it("OUT_OF_PERIOD: work dated outside the invoice window", () => {
    expect(codes([line({ date: "2026-05-15" })])).toContain("OUT_OF_PERIOD");
  });

  it("DUPLICATE: second identical line flagged, first is not", () => {
    const dup = runInvoiceReview([line({ id: "a" }), line({ id: "b" })], ctx());
    const dupFlags = dup.flags.filter((f) => f.code === "DUPLICATE");
    expect(dupFlags).toHaveLength(1);
    expect(dupFlags[0].lineId).toBe("b");
  });

  it("NON_BILLABLE: clerical work at counsel rates", () => {
    expect(codes([line({ description: "Clerical filing documents with the court clerk" })])).toContain("NON_BILLABLE");
  });

  it("VAGUE_NARRATIVE is a judgment flag with no auto-reduction", () => {
    const r = runInvoiceReview([line({ description: "attention to matter" })], ctx());
    const f = r.flags.find((x) => x.code === "VAGUE_NARRATIVE")!;
    expect(f.severity).toBe("judgment");
    expect(f.proposedReduction).toBe(0);
    expect(r.proposedShortPay).toBe(0); // judgment flags never auto-reduce
  });

  it("BLOCK_BILLING: multiple tasks lumped in one entry (judgment)", () => {
    const r = runInvoiceReview(
      [line({ description: "Draft brief; confer with client; research precedent and revise motion", hours: 6, amount: 6000 })],
      ctx(),
    );
    const f = r.flags.find((x) => x.code === "BLOCK_BILLING");
    expect(f?.severity).toBe("judgment");
  });

  it("EXCESSIVE_HOURS: single entry over the daily guideline (judgment)", () => {
    expect(codes([line({ hours: 16, amount: 16000 })])).toContain("EXCESSIVE_HOURS");
  });

  it("OVER_BUDGET: invoice-level judgment flag when it exceeds remaining budget", () => {
    const r = runInvoiceReview([line({ hours: 2, rate: 1000, amount: 2000 })], ctx({ budgetRemaining: 1000 }));
    const f = r.flags.find((x) => x.code === "OVER_BUDGET")!;
    expect(f.lineId).toBeNull();
    expect(f.severity).toBe("judgment");
  });

  it("only deterministic flags feed the short-pay; approved = invoiced − deterministic", () => {
    const r = runInvoiceReview(
      [
        line({ id: "a", rate: 1200, amount: 2400 }), // rate over card → -400
        line({ id: "b", description: "attention to matter" }), // judgment → 0
      ],
      ctx(),
    );
    expect(r.invoicedAmount).toBe(4400);
    expect(r.proposedShortPay).toBe(400);
    expect(r.proposedApprovedAmount).toBe(4000);
  });
});
