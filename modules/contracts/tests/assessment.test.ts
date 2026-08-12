import { describe, it, expect } from "vitest";
import { verdictFromIssues, summarize } from "../src/internal/assessment";
import type { AssessmentIssue } from "../src/internal/assessment";

const issue = (position: AssessmentIssue["position"]): AssessmentIssue => ({
  clauseType: "LIABILITY_CAP", severity: "HIGH", position, concern: "x", recommendedPosition: "y",
});

describe("verdictFromIssues", () => {
  it("DO_NOT_SIGN when any issue is REJECT", () => {
    expect(verdictFromIssues([issue("NEGOTIATE"), issue("REJECT")])).toBe("DO_NOT_SIGN");
  });
  it("NEGOTIATE when any issue is NEGOTIATE (and none REJECT)", () => {
    expect(verdictFromIssues([issue("ACCEPT"), issue("NEGOTIATE")])).toBe("NEGOTIATE");
  });
  it("SIGN_AS_IS when nothing needs attention", () => {
    expect(verdictFromIssues([])).toBe("SIGN_AS_IS");
    expect(verdictFromIssues([issue("ACCEPT")])).toBe("SIGN_AS_IS");
  });
});

describe("summarize", () => {
  it("clean when no issues", () => {
    expect(summarize([])).toMatch(/acceptable to sign/i);
  });
  it("counts rejects and negotiates", () => {
    const s = summarize([issue("REJECT"), issue("NEGOTIATE"), issue("NEGOTIATE")]);
    expect(s).toContain("3 clauses need attention");
    expect(s).toContain("1 to reject");
    expect(s).toContain("2 to negotiate");
  });
});
