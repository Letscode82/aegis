import { describe, it, expect } from "vitest";
import { scoreRelevanceDeterministic, verdictFromScore, tokenize } from "../src/internal/relevance";

describe("verdictFromScore", () => {
  it("bands score into verdicts", () => {
    expect(verdictFromScore(0.9)).toBe("RELEVANT");
    expect(verdictFromScore(0.45)).toBe("RELEVANT");
    expect(verdictFromScore(0.3)).toBe("UNCLEAR");
    expect(verdictFromScore(0.1)).toBe("NOT_RELEVANT");
  });
});

describe("tokenize", () => {
  it("drops stopwords and short tokens", () => {
    expect(tokenize("The personal data of Alice Johnson")).toEqual(["alice", "johnson"]);
  });
});

describe("scoreRelevanceDeterministic", () => {
  const criteria = "Records concerning Alice Johnson's marketing preferences and email consent";
  it("boosts strongly when the subject's email appears", () => {
    const r = scoreRelevanceDeterministic({
      criteria, subjectName: "Alice Johnson", subjectEmail: "alice@x.com",
      item: { title: "Newsletter opt-in", excerpt: "alice@x.com subscribed to the marketing list" },
    });
    expect(r.verdict).toBe("RELEVANT");
    expect(r.score).toBeGreaterThanOrEqual(0.5);
    expect(r.rationale).toContain("email");
  });
  it("marks an unrelated record not relevant", () => {
    const r = scoreRelevanceDeterministic({
      criteria, subjectName: "Alice Johnson", subjectEmail: "alice@x.com",
      item: { title: "Server maintenance log", excerpt: "nightly backup completed for cluster 7" },
    });
    expect(r.verdict).toBe("NOT_RELEVANT");
    expect(r.score).toBeLessThan(0.15);
  });
  it("name match without email still counts as a signal", () => {
    const r = scoreRelevanceDeterministic({
      criteria, subjectName: "Alice Johnson", subjectEmail: null,
      item: { title: "Meeting notes", excerpt: "Alice Johnson attended the marketing review" },
    });
    expect(r.rationale).toContain("name");
    expect(["RELEVANT", "UNCLEAR"]).toContain(r.verdict);
  });
});
