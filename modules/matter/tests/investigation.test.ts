/**
 * INV-1 — deterministic investigation plan extraction from a source letter.
 */
import { describe, it, expect } from "vitest";
import { extractInvestigationPlan } from "../src/internal/services/investigation";

describe("extractInvestigationPlan", () => {
  it("extracts trade-secret issues + a plan from a source letter", () => {
    const d = extractInvestigationPlan(
      "A departing VP took trade-secret source code and pricing models to a competitor before resigning.",
      "Project Falcon",
    );
    expect(d.title).toBe("Project Falcon");
    expect(d.issues.map((i) => i.key)).toContain("IP_TRADE_SECRET");
    expect(d.plan.steps.length).toBeGreaterThan(3);
    expect(d.plan.dataSources).toContain("Exchange mailbox");
    // Custodian hints always include the named subject.
    expect(d.plan.custodianHints.some((h) => /subject/i.test(h.name))).toBe(true);
    expect(d.plan.scopeSuggestion.toLowerCase()).toContain("responsive");
  });

  it("is deterministic", () => {
    const a = extractInvestigationPlan("invoice fraud in accounting and finance", "Probe");
    const b = extractInvestigationPlan("invoice fraud in accounting and finance", "Probe");
    expect(a).toEqual(b);
    expect(a.issues.map((i) => i.key)).toContain("FINANCIAL");
  });
});
