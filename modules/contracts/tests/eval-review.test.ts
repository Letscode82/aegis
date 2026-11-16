import { describe, it, expect } from "vitest";
import { runEvalSuite, exactScore, assertEvalThreshold, formatEvalReport } from "@aegis/ai";
import { buildReviewFindings, type ReviewClauseInput } from "../src/internal/review";
import type { PlaybookRuleDTO } from "../src/internal/playbook";

/**
 * EVAL — playbook review grading (deterministic engine, CI-safe).
 *
 * Golden (clause, playbook) pairs → the grade the review engine MUST assign
 * (STANDARD / FALLBACK / ESCALATE / MISSING). This is the exact "grade a
 * third-party clause against our playbook" surface the user worried could
 * silently regress; the harness pins its decisions. Exact-grade match, bar
 * = 100%.
 */
function rule(p: Partial<PlaybookRuleDTO> & { clauseType: string; preferredText: string }): PlaybookRuleDTO {
  return {
    id: `r-${p.clauseType}`,
    clauseType: p.clauseType,
    clauseCode: p.clauseCode ?? p.clauseType,
    title: p.title ?? p.clauseType,
    preferredText: p.preferredText,
    fallbackTexts: p.fallbackTexts ?? [],
    walkAwayText: p.walkAwayText ?? null,
    required: p.required ?? false,
    requiredLanguage: p.requiredLanguage ?? null,
    guidance: p.guidance ?? null,
    escalationTrigger: p.escalationTrigger ?? null,
    precedentRefs: p.precedentRefs ?? [],
    severityWeight: p.severityWeight ?? 3,
    orderIndex: p.orderIndex ?? 0,
  };
}

const RULES: PlaybookRuleDTO[] = [
  rule({
    clauseType: "LIABILITY_CAP",
    preferredText: "The total liability of each party under this Agreement is capped at the fees paid in the twelve months preceding the claim.",
    fallbackTexts: ["The total liability of each party is capped at the total fees paid under this Agreement."],
  }),
  rule({
    clauseType: "PAYMENT",
    preferredText: "Customer shall pay all undisputed invoices within forty-five (45) days of receipt.",
    fallbackTexts: ["Customer shall pay all undisputed invoices within thirty (30) days of receipt with a prompt-payment discount."],
  }),
  rule({
    clauseType: "CONFIDENTIALITY",
    preferredText: "Each party shall protect the other's Confidential Information with reasonable care for a period of three years.",
    required: true,
    requiredLanguage: "three years",
  }),
];

const byType = (t: string) => RULES.find((r) => r.clauseType === t)!;

interface GradeCase {
  name: string;
  clause: ReviewClauseInput;
  expected: "STANDARD" | "FALLBACK" | "ESCALATE";
}

const CASES: GradeCase[] = [
  {
    name: "on-playbook-liability → STANDARD",
    clause: { anchorId: "c1", clauseType: "LIABILITY_CAP", text: byType("LIABILITY_CAP").preferredText },
    expected: "STANDARD",
  },
  {
    name: "acceptable-fallback-payment → FALLBACK",
    clause: { anchorId: "c1", clauseType: "PAYMENT", text: byType("PAYMENT").fallbackTexts[0]! },
    expected: "FALLBACK",
  },
  {
    name: "off-playbook-liability → ESCALATE",
    clause: { anchorId: "c1", clauseType: "LIABILITY_CAP", text: "Vendor's liability shall be unlimited and uncapped for all losses whatsoever." },
    expected: "ESCALATE",
  },
  {
    name: "missing-required-language → ESCALATE",
    clause: { anchorId: "c1", clauseType: "CONFIDENTIALITY", text: "Each party shall protect the other's Confidential Information with reasonable care." },
    expected: "ESCALATE",
  },
];

function gradeOf(c: GradeCase): string | null {
  const findings = buildReviewFindings([c.clause], RULES);
  const f = findings.find((x) => x.clauseAnchorId === c.clause.anchorId);
  return f ? f.grade : null;
}

describe("EVAL — playbook review grading", () => {
  it("assigns the correct grade for every golden clause (exact, 100%)", () => {
    const report = runEvalSuite(CASES, gradeOf, (expected, got) => exactScore(expected, got));
    // eslint-disable-next-line no-console
    if (report.failures.length) console.log(formatEvalReport(report, "review-grading"));
    assertEvalThreshold(report, { minPassRate: 1, label: "review-grading" });
  });

  it("flags a required clause absent from their paper as MISSING", () => {
    const findings = buildReviewFindings([{ anchorId: "c1", clauseType: "LIABILITY_CAP", text: byType("LIABILITY_CAP").preferredText }], RULES);
    const missing = findings.find((f) => f.clauseType === "CONFIDENTIALITY");
    expect(missing?.grade).toBe("MISSING");
    expect(missing?.editKind).toBe("INSERTION");
  });
});
