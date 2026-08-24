import { describe, it, expect } from "vitest";
import { resolveCostModel } from "../src/eca";

describe("resolveCostModel", () => {
  it("uses defaults when nothing is provided", () => {
    expect(resolveCostModel()).toEqual({ perDocMinutes: 2, hourlyRate: 75, currency: "USD" });
  });

  it("ignores undefined overrides instead of clobbering the defaults with NaN", () => {
    expect(resolveCostModel({ perDocMinutes: undefined, hourlyRate: undefined })).toEqual({
      perDocMinutes: 2,
      hourlyRate: 75,
      currency: "USD",
    });
  });

  it("applies valid positive overrides", () => {
    expect(resolveCostModel({ perDocMinutes: 5, hourlyRate: 120 })).toEqual({
      perDocMinutes: 5,
      hourlyRate: 120,
      currency: "USD",
    });
  });

  it("rejects zero / negative / non-finite values", () => {
    expect(resolveCostModel({ perDocMinutes: 0, hourlyRate: -3 })).toMatchObject({ perDocMinutes: 2, hourlyRate: 75 });
    expect(resolveCostModel({ perDocMinutes: NaN })).toMatchObject({ perDocMinutes: 2 });
  });

  it("honours a currency override", () => {
    expect(resolveCostModel({ currency: "EUR" }).currency).toBe("EUR");
  });
});
