import { describe, it, expect } from "vitest";
import {
  gradeClauseAgainstRule,
  proposeRulesFromClauses,
  textSimilarity,
  containsRequiredLanguage,
} from "../src/internal/playbook";

const rule = {
  preferredText: "Each party's aggregate liability is capped at the fees paid in the twelve months preceding the claim, excluding indirect and consequential damages.",
  fallbackTexts: [
    "Aggregate liability is capped at two times the fees paid in the prior twelve months.",
  ],
  required: false,
  requiredLanguage: null as string | null,
};

describe("playbook grading (PR B)", () => {
  it("near-identical clause grades STANDARD", () => {
    const clause = "Each party's aggregate liability is capped at the fees paid in the twelve months preceding the claim, excluding indirect and consequential damages.";
    const r = gradeClauseAgainstRule(clause, rule);
    expect(r.grade).toBe("STANDARD");
    expect(r.matched).toBe("preferred");
  });

  it("a clause close to a fallback grades FALLBACK", () => {
    const clause = "Aggregate liability is capped at two times the fees paid in the prior twelve months period.";
    const r = gradeClauseAgainstRule(clause, rule);
    expect(r.grade).toBe("FALLBACK");
    expect(r.fallbackIndex).toBe(0);
  });

  it("an off-playbook clause grades ESCALATE", () => {
    const clause = "There shall be no limitation of liability whatsoever; each party is liable for all damages without cap.";
    const r = gradeClauseAgainstRule(clause, rule);
    expect(r.grade).toBe("ESCALATE");
    expect(r.matched).toBe("none");
  });

  it("missing required language forces ESCALATE even on a similar clause", () => {
    const required = { ...rule, required: true, requiredLanguage: "governed by the laws of Delaware" };
    // text is similar to preferred but omits the required Delaware language
    const clause = rule.preferredText;
    const r = gradeClauseAgainstRule(clause, required);
    expect(r.requiredLanguageMissing).toBe(true);
    expect(r.grade).toBe("ESCALATE");
  });

  it("required language present keeps the normal grade", () => {
    const required = { ...rule, required: true, requiredLanguage: "indirect and consequential damages" };
    const r = gradeClauseAgainstRule(rule.preferredText, required);
    expect(r.requiredLanguageMissing).toBe(false);
    expect(r.grade).toBe("STANDARD");
  });

  it("textSimilarity is 1 for identical, lower for different", () => {
    expect(textSimilarity("net 30 payment terms", "net 30 payment terms")).toBe(1);
    expect(textSimilarity("net 30 payment terms", "net 90 billing cycle")).toBeLessThan(0.5);
  });

  it("containsRequiredLanguage is loose/normalized", () => {
    expect(containsRequiredLanguage("Governed by the LAWS of Delaware.", "laws of Delaware")).toBe(true);
    expect(containsRequiredLanguage("Governed by New York law.", "laws of Delaware")).toBe(false);
    expect(containsRequiredLanguage("anything", null)).toBe(true);
  });
});

describe("proposeRulesFromClauses (PR B generate-from-precedent)", () => {
  it("groups by type, picks the most common non-deviating text as preferred", () => {
    const clauses = [
      { contractId: "c1", clauseId: "x1", type: "LIABILITY_CAP", text: "Liability is capped at fees paid in the prior twelve months.", deviation: false },
      { contractId: "c2", clauseId: "x2", type: "LIABILITY_CAP", text: "Liability is capped at fees paid in the prior twelve months.", deviation: false },
      { contractId: "c3", clauseId: "x3", type: "LIABILITY_CAP", text: "Unlimited liability with no cap whatsoever applies here.", deviation: true },
      { contractId: "c4", clauseId: "x4", type: "INDEMNITY", text: "Each party indemnifies the other for third-party IP claims.", deviation: false },
    ];
    const rules = proposeRulesFromClauses(clauses);
    const liab = rules.find((r) => r.clauseType === "LIABILITY_CAP");
    expect(liab).toBeTruthy();
    expect(liab!.preferredText).toMatch(/capped at fees paid/);
    expect(liab!.occurrences).toBe(2);
    expect(liab!.precedentRefs.length).toBeGreaterThan(0);
    // two distinct clause types proposed
    expect(rules.map((r) => r.clauseType).sort()).toEqual(["INDEMNITY", "LIABILITY_CAP"]);
  });

  it("falls back to deviating clauses when no agreed ones exist", () => {
    const rules = proposeRulesFromClauses([
      { contractId: "c1", clauseId: "x1", type: "TERM", text: "This agreement runs for three years.", deviation: true },
    ]);
    expect(rules).toHaveLength(1);
    expect(rules[0].preferredText).toMatch(/three years/);
  });
});
