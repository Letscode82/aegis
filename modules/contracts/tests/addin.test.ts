import { describe, it, expect } from "vitest";
import { buildAddinReview } from "../src/internal/addin";
import type { PlaybookRuleDTO } from "../src/internal/playbook";

function rule(partial: Partial<PlaybookRuleDTO> & { clauseType: string; preferredText: string }): PlaybookRuleDTO {
  return {
    id: `rule-${partial.clauseType}`,
    clauseType: partial.clauseType,
    clauseCode: partial.clauseType,
    title: partial.clauseType,
    preferredText: partial.preferredText,
    fallbackTexts: partial.fallbackTexts ?? [],
    walkAwayText: partial.walkAwayText ?? null,
    required: partial.required ?? false,
    requiredLanguage: partial.requiredLanguage ?? null,
    guidance: partial.guidance ?? null,
    escalationTrigger: partial.escalationTrigger ?? null,
    precedentRefs: [],
    severityWeight: partial.severityWeight ?? 1,
    orderIndex: 0,
  };
}

const rules: PlaybookRuleDTO[] = [
  rule({
    clauseType: "LIABILITY_CAP",
    preferredText: "Each party's aggregate liability is capped at the fees paid in the twelve months preceding the claim, excluding indirect and consequential damages.",
    severityWeight: 3,
  }),
  rule({
    clauseType: "GOVERNING_LAW",
    preferredText: "This agreement is governed by the laws of the State of Delaware.",
    required: true,
    requiredLanguage: "laws of the State of Delaware",
  }),
];

describe("buildAddinReview (PR E — Word add-in surface)", () => {
  it("returns only actionable items with suggested redline text", () => {
    const { items, summary } = buildAddinReview(
      [{ type: "LIABILITY_CAP", text: "There is no cap on liability whatsoever; each party is liable for all damages." }],
      rules,
    );
    // STANDARD clauses are filtered out; the off-playbook cap + the missing
    // required governing-law clause remain.
    expect(items.every((i) => i.grade !== "STANDARD")).toBe(true);
    const liab = items.find((i) => i.clauseType === "LIABILITY_CAP")!;
    expect(liab.grade).toBe("ESCALATE");
    expect(liab.suggestedText).toBe(rules[0].preferredText);
    expect(summary.riskBand).toBe("HIGH");
  });

  it("is empty when every clause is on our position", () => {
    const { items } = buildAddinReview(
      [
        { type: "LIABILITY_CAP", text: rules[0].preferredText },
        { type: "GOVERNING_LAW", text: rules[1].preferredText },
      ],
      rules,
    );
    expect(items).toHaveLength(0);
  });
});
