import { describe, it, expect } from "vitest";
import { buildPrivacyProgramExport, type PrivacyProgramSummary } from "../src/internal/program";

const base: PrivacyProgramSummary = {
  dsar: { total: 0, open: 0 },
  assessments: { total: 0, inReview: 0, highRisk: 0, dpiaRequired: 0 },
  ropa: { activities: 0 },
  incidents: { total: 0, open: 0, breaching: 0 },
  consent: { active: 0, withdrawn: 0 },
};

describe("buildPrivacyProgramExport", () => {
  it("a clean program scores 100 with no attention items", () => {
    const r = buildPrivacyProgramExport(base, { organization: "Acme", generatedAt: "2026-01-01T00:00:00Z" });
    expect(r.$schema).toBe("aegis.privacy.program.defensibility.v1");
    expect(r.organization).toBe("Acme");
    expect(r.generatedAt).toBe("2026-01-01T00:00:00Z");
    expect(r.posture.score).toBe(100);
    expect(r.posture.openTotal).toBe(0);
    expect(r.posture.attentionItems).toEqual([]);
    expect(r.summary).toEqual(base);
  });

  it("a breaching incident is the heaviest penalty and leads the attention list", () => {
    const r = buildPrivacyProgramExport(
      { ...base, incidents: { total: 1, open: 1, breaching: 1 } },
      { organization: "Acme" },
    );
    // 100 - 25 (breach) - 3 (open) = 72
    expect(r.posture.score).toBe(72);
    expect(r.posture.attentionItems[0]).toContain("72-hour");
  });

  it("penalties accumulate and the score clamps at 0", () => {
    const r = buildPrivacyProgramExport(
      {
        ...base,
        incidents: { total: 5, open: 5, breaching: 5 },
        assessments: { total: 10, inReview: 10, highRisk: 10, dpiaRequired: 3 },
      },
      { organization: "Acme" },
    );
    expect(r.posture.score).toBe(0);
  });

  it("openTotal sums open DSARs, in-review assessments and open incidents", () => {
    const r = buildPrivacyProgramExport(
      {
        ...base,
        dsar: { total: 4, open: 2 },
        assessments: { total: 3, inReview: 3, highRisk: 0, dpiaRequired: 0 },
        incidents: { total: 2, open: 1, breaching: 0 },
      },
      { organization: "Acme" },
    );
    expect(r.posture.openTotal).toBe(2 + 3 + 1);
  });

  it("pluralizes attention items (singular vs plural)", () => {
    const one = buildPrivacyProgramExport({ ...base, dsar: { total: 1, open: 1 } }, { organization: "Acme" });
    expect(one.posture.attentionItems).toContain("1 DSAR open");
    const many = buildPrivacyProgramExport({ ...base, dsar: { total: 3, open: 3 } }, { organization: "Acme" });
    expect(many.posture.attentionItems).toContain("3 DSARs open");
  });

  it("defaults generatedAt to an ISO timestamp when omitted", () => {
    const r = buildPrivacyProgramExport(base, { organization: "Acme" });
    expect(() => new Date(r.generatedAt).toISOString()).not.toThrow();
    expect(r.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
