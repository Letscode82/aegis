/**
 * AIR-2 — deterministic "Draft with AI" for review profiles.
 */
import { describe, it, expect } from "vitest";
import { draftReviewCriteria } from "../src/draft";

describe("draftReviewCriteria", () => {
  it("derives issue themes from description keywords", () => {
    const d = draftReviewCriteria({
      description: "Departing VP took trade-secret source code and pricing models to a competitor.",
      context: "Project Falcon",
    });
    expect(d.degraded).toBe(true);
    const keys = d.issues.map((i) => i.key);
    // Trade-secret + competitor pricing → IP + antitrust themes surface.
    expect(keys).toContain("IP_TRADE_SECRET");
    expect(d.issues.length).toBeGreaterThan(0);
    expect(d.criteria.toLowerCase()).toContain("responsive");
    expect(d.name).toContain("Project Falcon");
    expect(d.dimensions).toContain("RESPONSIVE");
  });

  it("falls back to a generic responsive issue when no theme matches", () => {
    const d = draftReviewCriteria({ description: "zzz qqq wwwww vvvvv" });
    expect(d.issues).toEqual([{ key: "RESPONSIVE", label: "Responsive to the matter" }]);
    expect(d.criteria.length).toBeGreaterThan(0);
  });

  it("is deterministic across calls", () => {
    const a = draftReviewCriteria({ description: "invoice payment revenue accounting audit", context: "Finance probe" });
    const b = draftReviewCriteria({ description: "invoice payment revenue accounting audit", context: "Finance probe" });
    expect(a).toEqual(b);
    expect(a.issues.map((i) => i.key)).toContain("FINANCIAL");
  });
});
