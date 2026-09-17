import { describe, it, expect } from "vitest";
import { scoreAssessment, ASSESSMENT_TEMPLATES, getAssessmentTemplates, type AssessmentAnswer } from "../src/internal/assessments";

const answersFor = (type: keyof typeof ASSESSMENT_TEMPLATES, yes: string[]): AssessmentAnswer[] =>
  ASSESSMENT_TEMPLATES[type].questions.map((q) => ({ questionId: q.id, question: q.question, answer: yes.includes(q.id) ? "yes" : "no", weight: q.weight }));

describe("privacy assessment scoring", () => {
  it("all-no is LOW risk, zero score", () => {
    const r = scoreAssessment("DPIA", answersFor("DPIA", []));
    expect(r.riskScore).toBe(0);
    expect(r.riskLevel).toBe("LOW");
  });

  it("all-yes is SEVERE", () => {
    const all = ASSESSMENT_TEMPLATES.DPIA.questions.map((q) => q.id);
    const r = scoreAssessment("DPIA", answersFor("DPIA", all));
    expect(r.riskLevel).toBe("SEVERE");
    expect(r.riskScore).toBeGreaterThan(0);
  });

  it("a single hard-trigger (weight>=4) floors at HIGH", () => {
    // special_category has weight 4 in DPIA
    const r = scoreAssessment("DPIA", answersFor("DPIA", ["special_category"]));
    expect(["HIGH", "SEVERE"]).toContain(r.riskLevel);
  });

  it("PIA screen flags dpiaRequired when high risk", () => {
    const high = scoreAssessment("PIA", answersFor("PIA", ["special_category", "automated_decisions"]));
    expect(high.dpiaRequired).toBe(true);
    const low = scoreAssessment("PIA", answersFor("PIA", []));
    expect(low.dpiaRequired).toBe(false);
  });

  it("non-PIA types never set dpiaRequired", () => {
    const r = scoreAssessment("VENDOR", answersFor("VENDOR", ["no_dpa"]));
    expect(r.dpiaRequired).toBe(false);
  });

  it("ships six templates, each with weighted questions", () => {
    const t = getAssessmentTemplates();
    expect(t).toHaveLength(6);
    for (const tmpl of t) {
      expect(tmpl.questions.length).toBeGreaterThan(0);
      expect(tmpl.questions.every((q) => typeof q.weight === "number")).toBe(true);
    }
  });
});
