import { describe, it, expect } from "vitest";
import { normalizeObligationDescription, selectNewObligations } from "../src/internal/obligation-finalize";

describe("normalizeObligationDescription", () => {
  it("lowercases, trims, and collapses internal whitespace", () => {
    expect(normalizeObligationDescription("  Pay   the   Invoice\n")).toBe("pay the invoice");
  });
  it("is stable for equivalent descriptions", () => {
    expect(normalizeObligationDescription("Deliver SOW")).toBe(normalizeObligationDescription("deliver   sow"));
  });
  it("handles empty / whitespace-only input", () => {
    expect(normalizeObligationDescription("")).toBe("");
    expect(normalizeObligationDescription("   ")).toBe("");
  });
});

describe("selectNewObligations", () => {
  const ext = (description: string) => ({ description, dueInDays: null, recurrence: null });

  it("keeps only obligations not already tracked (by normalized description)", () => {
    const extracted = [ext("Pay the invoice"), ext("Deliver SOW"), ext("Renew license")];
    const existing = new Set([normalizeObligationDescription("pay the invoice")]);
    const out = selectNewObligations(extracted, existing);
    expect(out.map((o) => o.description)).toEqual(["Deliver SOW", "Renew license"]);
  });

  it("dedups within the extracted set itself", () => {
    const extracted = [ext("Pay invoice"), ext("pay   invoice"), ext("Deliver")];
    const out = selectNewObligations(extracted, new Set());
    expect(out.map((o) => o.description)).toEqual(["Pay invoice", "Deliver"]);
  });

  it("skips blank descriptions", () => {
    const out = selectNewObligations([ext("   "), ext("Real")], new Set());
    expect(out.map((o) => o.description)).toEqual(["Real"]);
  });

  it("returns nothing when everything is already tracked", () => {
    const extracted = [ext("A"), ext("B")];
    const existing = new Set(["a", "b"]);
    expect(selectNewObligations(extracted, existing)).toEqual([]);
  });

  it("returns everything when nothing is tracked yet", () => {
    const extracted = [ext("A"), ext("B")];
    expect(selectNewObligations(extracted, new Set())).toHaveLength(2);
  });

  it("preserves the extra fields on kept items (dueInDays, recurrence)", () => {
    const extracted = [{ description: "Quarterly report", dueInDays: 90, recurrence: "P3M" }];
    const out = selectNewObligations(extracted, new Set());
    expect(out[0]).toEqual({ description: "Quarterly report", dueInDays: 90, recurrence: "P3M" });
  });
});
