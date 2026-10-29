import { describe, it, expect } from "vitest";
import { normalizeClauseType, coerceAiFindings, mapAiFindingsToBuilt, buildAiReviewPrompt, type AiReviewFinding } from "../src/internal/review-ai";
import type { PlaybookRuleDTO } from "../src/internal/playbook";

function rule(partial: Partial<PlaybookRuleDTO> & { id: string; clauseType: string }): PlaybookRuleDTO {
  return {
    clauseCode: partial.clauseType, title: partial.clauseType, preferredText: "Our standard position.",
    fallbackTexts: [], walkAwayText: null, required: false, requiredLanguage: null, guidance: null,
    escalationTrigger: null, precedentRefs: [], severityWeight: 1, orderIndex: 0, ...partial,
  } as PlaybookRuleDTO;
}

const RULES: PlaybookRuleDTO[] = [
  rule({ id: "r-liab", clauseType: "LIABILITY_CAP", preferredText: "Cap at 12 months' fees.", required: true, severityWeight: 3, guidance: "Reject uncapped." }),
  rule({ id: "r-law", clauseType: "GOVERNING_LAW", preferredText: "Delaware law.", severityWeight: 1 }),
];

describe("normalizeClauseType", () => {
  it("UPPER_SNAKEs free text", () => {
    expect(normalizeClauseType("Governing Law")).toBe("GOVERNING_LAW");
    expect(normalizeClauseType(" intellectual-property ")).toBe("INTELLECTUAL_PROPERTY");
    expect(normalizeClauseType("liability_cap")).toBe("LIABILITY_CAP");
  });
});

describe("coerceAiFindings", () => {
  it("accepts {findings:[…]} and a bare array", () => {
    const f = [{ clauseType: "GOVERNING_LAW", grade: "ESCALATE", excerpt: "x", rationale: "y", suggestedText: null, severity: 3 }];
    expect(coerceAiFindings({ findings: f })).toHaveLength(1);
    expect(coerceAiFindings(f)).toHaveLength(1);
  });
  it("drops invalid grades + empty types, defaults severity, nulls empty suggestedText", () => {
    const out = coerceAiFindings({ findings: [
      { clauseType: "GOVERNING_LAW", grade: "NONSENSE", excerpt: "", rationale: "", suggestedText: "", severity: 2 },
      { clauseType: "", grade: "ESCALATE", excerpt: "", rationale: "", suggestedText: "", severity: 2 },
      { clauseType: "Confidentiality", grade: "escalate", excerpt: "e", rationale: "r", suggestedText: "", severity: "oops" },
    ] });
    expect(out).toHaveLength(1);
    expect(out[0].clauseType).toBe("CONFIDENTIALITY");
    expect(out[0].grade).toBe("ESCALATE");
    expect(out[0].suggestedText).toBeNull();
    expect(out[0].severity).toBe(3); // default for ESCALATE
  });
  it("returns [] for junk, never throws", () => {
    expect(coerceAiFindings(null)).toEqual([]);
    expect(coerceAiFindings("not json")).toEqual([]);
    expect(coerceAiFindings({})).toEqual([]);
  });
});

describe("mapAiFindingsToBuilt", () => {
  const live = [{ anchorId: "a-law", clauseType: "GOVERNING_LAW", text: "Laws of Germany." }];
  const ai: AiReviewFinding[] = [
    { clauseType: "GOVERNING_LAW", grade: "ESCALATE", excerpt: "Laws of Germany", rationale: "Foreign law", suggestedText: null, severity: 1 },
    { clauseType: "CONFIDENTIALITY", grade: "ESCALATE", excerpt: "survives in perpetuity", rationale: "Perpetual", suggestedText: "Survives 3 years.", severity: 3 },
    { clauseType: "PAYMENT", grade: "STANDARD", excerpt: "Net 45", rationale: "ok", suggestedText: null, severity: 0 },
  ];
  const built = mapAiFindingsToBuilt(ai, live, RULES);

  it("anchors a known-type finding → REPLACEMENT, suggested falls back to our position", () => {
    const law = built.find((f) => f.clauseType === "GOVERNING_LAW");
    expect(law?.clauseAnchorId).toBe("a-law");
    expect(law?.editKind).toBe("REPLACEMENT");
    expect(law?.suggestedText).toBe("Delaware law.");
    expect(law?.playbookRuleId).toBe("r-law");
    expect(law?.grade).toBe("ESCALATE");
  });

  it("an off-playbook finding with no anchor stays flagged but advisory (editKind NONE)", () => {
    const conf = built.find((f) => f.clauseType === "CONFIDENTIALITY");
    expect(conf?.grade).toBe("ESCALATE");
    expect(conf?.clauseAnchorId).toBeNull();
    expect(conf?.editKind).toBe("NONE");
    expect(conf?.suggestedText).toBe("Survives 3 years.");
    expect(conf?.playbookRuleId).toBeNull();
  });

  it("STANDARD is informational (NONE, severity 0)", () => {
    const pay = built.find((f) => f.clauseType === "PAYMENT");
    expect(pay?.editKind).toBe("NONE");
    expect(pay?.severity).toBe(0);
  });

  it("appends MISSING INSERTION for an uncovered required rule", () => {
    const miss = built.find((f) => f.clauseType === "LIABILITY_CAP");
    expect(miss?.grade).toBe("MISSING");
    expect(miss?.editKind).toBe("INSERTION");
    expect(miss?.playbookRuleId).toBe("r-liab");
    expect(miss?.suggestedText).toBe("Cap at 12 months' fees.");
    expect(miss?.severity).toBe(9); // 3 * severityWeight 3
  });

  it("sorts worst-first and assigns orderIndex", () => {
    expect(built[0].severity).toBeGreaterThanOrEqual(built[built.length - 1].severity);
    built.forEach((f, i) => expect(f.orderIndex).toBe(i));
  });

  it("uses the AI's suggestedText for an anchored replacement when given", () => {
    const b = mapAiFindingsToBuilt(
      [{ clauseType: "GOVERNING_LAW", grade: "ESCALATE", excerpt: "DE", rationale: "r", suggestedText: "Governed by Delaware.", severity: 3 }],
      live, RULES,
    );
    const law = b.find((f) => f.clauseType === "GOVERNING_LAW");
    expect(law?.editKind).toBe("REPLACEMENT");
    expect(law?.suggestedText).toBe("Governed by Delaware.");
  });
});

describe("buildAiReviewPrompt", () => {
  it("lists allowed clause types, our positions, and the document, and asks for JSON", () => {
    const p = buildAiReviewPrompt("THIS AGREEMENT is governed by the laws of Germany.", RULES, { contractType: "NDA", perspective: "MUTUAL" });
    expect(p).toContain("LIABILITY_CAP");
    expect(p).toContain("GOVERNING_LAW");
    expect(p).toContain("laws of Germany");
    expect(p).toMatch(/"findings"/);
    expect(p).toMatch(/even-handed \(mutual\)/i);
  });
});
