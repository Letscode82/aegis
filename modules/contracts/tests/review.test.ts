import { describe, it, expect } from "vitest";
import { buildReviewFindings, buildDeltaReviewFindings, summarizeFindings } from "../src/internal/review";
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
    fallbackTexts: ["Aggregate liability is capped at two times the fees paid in the prior twelve months."],
    severityWeight: 3,
  }),
  rule({
    clauseType: "GOVERNING_LAW",
    preferredText: "This agreement is governed by the laws of the State of Delaware.",
    required: true,
    requiredLanguage: "laws of the State of Delaware",
    severityWeight: 1,
  }),
];

describe("buildReviewFindings (PR C — graded redline)", () => {
  it("grades a matching clause STANDARD with no edit", () => {
    const findings = buildReviewFindings(
      [{ anchorId: "a1", clauseType: "LIABILITY_CAP", text: rules[0].preferredText }],
      rules,
    );
    const liab = findings.find((f) => f.clauseType === "LIABILITY_CAP")!;
    expect(liab.grade).toBe("STANDARD");
    expect(liab.editKind).toBe("NONE");
    expect(liab.suggestedText).toBeNull();
  });

  it("grades an off-playbook clause ESCALATE with a replacement + gap card", () => {
    const findings = buildReviewFindings(
      [{ anchorId: "a1", clauseType: "LIABILITY_CAP", text: "There is no cap on liability; each party is liable for all damages including indirect and punitive." }],
      rules,
    );
    const liab = findings.find((f) => f.clauseType === "LIABILITY_CAP")!;
    expect(liab.grade).toBe("ESCALATE");
    expect(liab.editKind).toBe("REPLACEMENT");
    expect(liab.suggestedText).toBe(rules[0].preferredText); // our preferred language
    expect(liab.ourPosition).toBeTruthy();   // three-field gap card
    expect(liab.theirPosition).toContain("no cap");
    expect(liab.rationale).toBeTruthy();
    expect(liab.severity).toBe(9); // 3 (ESCALATE) * 3 (weight)
  });

  it("flags a required clause the document omits as MISSING → insertion", () => {
    const findings = buildReviewFindings(
      [{ anchorId: "a1", clauseType: "LIABILITY_CAP", text: rules[0].preferredText }],
      rules,
    );
    const missing = findings.find((f) => f.grade === "MISSING");
    expect(missing).toBeTruthy();
    expect(missing!.clauseType).toBe("GOVERNING_LAW");
    expect(missing!.editKind).toBe("INSERTION");
    expect(missing!.clauseAnchorId).toBeNull();
    expect(missing!.suggestedText).toContain("Delaware");
  });

  it("a clause near a fallback grades FALLBACK with the fallback as suggestion", () => {
    const findings = buildReviewFindings(
      [{ anchorId: "a1", clauseType: "LIABILITY_CAP", text: "Aggregate liability is capped at two times the fees paid in the prior twelve months term." }],
      rules,
    );
    const liab = findings.find((f) => f.clauseType === "LIABILITY_CAP")!;
    expect(liab.grade).toBe("FALLBACK");
    expect(liab.editKind).toBe("REPLACEMENT");
  });

  it("an unknown clause type is informational (no playbook position)", () => {
    const findings = buildReviewFindings(
      [{ anchorId: "a1", clauseType: "EXOTIC_CLAUSE", text: "Some bespoke provision." }],
      rules,
    );
    const f = findings.find((x) => x.clauseType === "EXOTIC_CLAUSE")!;
    expect(f.grade).toBe("STANDARD");
    expect(f.playbookRuleId).toBeNull();
  });
});

describe("buildDeltaReviewFindings (PR C2 — our paper, their marks)", () => {
  const sent = [
    { clauseType: "LIABILITY_CAP", text: rules[0].preferredText },
    { clauseType: "GOVERNING_LAW", text: rules[1].preferredText },
  ];

  it("stays silent on clauses they left as we drafted them", () => {
    const findings = buildDeltaReviewFindings(
      sent,
      [
        { anchorId: "a1", clauseType: "LIABILITY_CAP", text: rules[0].preferredText },
        { anchorId: "a2", clauseType: "GOVERNING_LAW", text: rules[1].preferredText },
      ],
      rules,
    );
    // Only whitespace-identical clauses — nothing actionable.
    expect(findings.filter((f) => f.grade !== "STANDARD")).toHaveLength(0);
  });

  it("flags a clause they edited off-playbook and reverts to our sent text", () => {
    const findings = buildDeltaReviewFindings(
      sent,
      [
        { anchorId: "a1", clauseType: "LIABILITY_CAP", text: "There is no cap on liability; each party is liable for all damages including indirect and punitive." },
        { anchorId: "a2", clauseType: "GOVERNING_LAW", text: rules[1].preferredText },
      ],
      rules,
    );
    const liab = findings.find((f) => f.clauseType === "LIABILITY_CAP")!;
    expect(liab.grade).toBe("ESCALATE");
    expect(liab.editKind).toBe("REPLACEMENT");
    expect(liab.clauseAnchorId).toBe("a1");
    expect(liab.suggestedText).toBe(rules[0].preferredText); // revert to our sent language
    expect(liab.ourPosition).toBe(rules[0].preferredText);
    expect(liab.theirPosition).toContain("no cap");
  });

  it("re-inserts a required clause they deleted (MISSING → insertion)", () => {
    const findings = buildDeltaReviewFindings(
      sent,
      [{ anchorId: "a1", clauseType: "LIABILITY_CAP", text: rules[0].preferredText }],
      rules,
    );
    const gone = findings.find((f) => f.clauseType === "GOVERNING_LAW")!;
    expect(gone.grade).toBe("MISSING");
    expect(gone.editKind).toBe("INSERTION");
    expect(gone.clauseAnchorId).toBeNull();
    expect(gone.suggestedText).toContain("Delaware");
  });

  it("strikes a unilateral addition with no playbook position", () => {
    const findings = buildDeltaReviewFindings(
      sent,
      [
        { anchorId: "a1", clauseType: "LIABILITY_CAP", text: rules[0].preferredText },
        { anchorId: "a2", clauseType: "GOVERNING_LAW", text: rules[1].preferredText },
        { anchorId: "a3", clauseType: "EXCLUSIVITY", text: "Supplier grants buyer exclusive rights for five years." },
      ],
      rules,
    );
    const added = findings.find((f) => f.clauseType === "EXCLUSIVITY")!;
    expect(added.grade).toBe("ESCALATE");
    expect(added.editKind).toBe("DELETION");
    expect(added.clauseAnchorId).toBe("a3");
  });

  it("ignores cosmetic whitespace-only edits", () => {
    const findings = buildDeltaReviewFindings(
      [{ clauseType: "GOVERNING_LAW", text: rules[1].preferredText }],
      [{ anchorId: "a1", clauseType: "GOVERNING_LAW", text: `  ${rules[1].preferredText}\n ` }],
      rules,
    );
    expect(findings.filter((f) => f.grade !== "STANDARD")).toHaveLength(0);
  });
});

describe("summarizeFindings", () => {
  it("rolls up counts, verdict and risk band", () => {
    const findings = buildReviewFindings(
      [
        { anchorId: "a1", clauseType: "LIABILITY_CAP", text: "No cap on liability at all whatsoever." },
      ],
      rules,
    );
    const s = summarizeFindings(findings);
    expect(s.total).toBe(findings.length);
    expect(s.escalate).toBe(1);
    expect(s.missing).toBe(1); // GOVERNING_LAW required + absent
    expect(s.riskBand).toBe("HIGH");
    expect(s.weightedScore).toBeLessThan(100);
  });

  it("all-standard review is low risk, score 100", () => {
    const s = summarizeFindings(buildReviewFindings(
      [
        { anchorId: "a1", clauseType: "LIABILITY_CAP", text: rules[0].preferredText },
        { anchorId: "a2", clauseType: "GOVERNING_LAW", text: rules[1].preferredText },
      ],
      rules,
    ));
    expect(s.escalate).toBe(0);
    expect(s.missing).toBe(0);
    expect(s.riskBand).toBe("LOW");
    expect(s.weightedScore).toBe(100);
    expect(s.scored).toBe(true);
    expect(s.confidence).toBe("high");
  });

  // 2a — the false-100 guard. A document that barely parsed must NOT read as a
  // confident clean bill of health.
  it("nothing gradeable → not scored, not a confident 100, not low-risk", () => {
    const findings = buildReviewFindings([{ anchorId: "a1", clauseType: "MYSTERY_TYPE", text: "Some clause with no playbook position." }], []);
    const s = summarizeFindings(findings);
    expect(s.scored).toBe(false);
    expect(s.confidence).toBe("low");
    expect(s.riskBand).not.toBe("LOW");
    expect(s.verdict).toMatch(/could not confidently grade|review manually/i);
  });

  it("thin parse of a long document → low confidence, non-LOW risk", () => {
    // 2 clauses graded STANDARD, but the source doc was long → likely missed terms.
    const s = summarizeFindings(
      buildReviewFindings(
        [
          { anchorId: "a1", clauseType: "LIABILITY_CAP", text: rules[0].preferredText },
          { anchorId: "a2", clauseType: "GOVERNING_LAW", text: rules[1].preferredText },
        ],
        rules,
      ),
      { clausesParsed: 2, docChars: 8000 },
    );
    expect(s.confidence).toBe("low");
    expect(s.riskBand).not.toBe("LOW");
  });

  it("good coverage keeps high confidence", () => {
    const s = summarizeFindings(
      buildReviewFindings(
        [
          { anchorId: "a1", clauseType: "LIABILITY_CAP", text: rules[0].preferredText },
          { anchorId: "a2", clauseType: "GOVERNING_LAW", text: rules[1].preferredText },
        ],
        rules,
      ),
      { clausesParsed: 9, docChars: 8000 },
    );
    expect(s.confidence).toBe("high");
  });
});
