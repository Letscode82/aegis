/**
 * Similar-matters relevance — must not surface an unrelated ticket
 * just because its appended document body shares incidental words.
 * Regression: a CDA (11k chars of contract text in `desc`) appeared as
 * a 30% "similar matter" for an employment-retaliation request.
 */
import { describe, expect, it } from "vitest";
import { findSimilarMatters } from "../src/copilot/similar-matters";

const CDA_DESC =
  "Review and suggest\n\n--- Attached document: CDA Template-Mutual.docx ---\n" +
  "MUTUAL CONFIDENTIALITY AND NON-DISCLOSURE AGREEMENT. The parties have a " +
  "concern about reporting confidential information; each party shall use " +
  "reasonable measures. Meetings between the parties may occur. " +
  "Overtime is not addressed. ".repeat(40);

const cdaTicket = {
  id: "REQ-3938",
  type: "CDA Request",
  status: "Auto-Completed",
  desc: CDA_DESC,
  aiTriage: { category: "NDA — Standard" },
  submittedTs: Date.now() - 86400000,
};

const retaliationTicket = {
  id: "REQ-3327",
  type: "Employment Issue",
  desc: "A team member has been experiencing a pattern of exclusion from meetings by their manager after reporting a concern about overtime. Concerned this might be retaliation.",
  aiTriage: { category: "Employment — Sensitive" },
};

describe("findSimilarMatters relevance", () => {
  it("does NOT surface a CDA as a match for an unrelated retaliation ticket", () => {
    const matches = findSimilarMatters(retaliationTicket, [cdaTicket]);
    expect(matches.find((m) => m.id === "REQ-3938")).toBeUndefined();
    expect(matches).toHaveLength(0);
  });

  it("DOES surface a genuinely similar prior matter (same category + real lead overlap)", () => {
    const priorRetaliation = {
      id: "REQ-3000",
      type: "Employment Issue",
      status: "Completed",
      triagedAction: "approved",
      triagedBy: "GC",
      desc: "Employee reporting a retaliation concern after raising overtime pay with their manager; exclusion from meetings.",
      aiTriage: { category: "Employment — Sensitive" },
      submittedTs: Date.now() - 5 * 86400000,
    };
    const matches = findSimilarMatters(retaliationTicket, [cdaTicket, priorRetaliation]);
    expect(matches[0]?.id).toBe("REQ-3000");
    expect(matches.find((m) => m.id === "REQ-3938")).toBeUndefined();
  });

  it("a single incidental shared word is not enough on its own", () => {
    const weak = {
      id: "REQ-9",
      type: "Vendor Contract",
      status: "Completed",
      desc: "Vendor onboarding concern for a new supplier in Brazil.", // shares only 'concern'
      aiTriage: { category: "Vendor Contract" },
      submittedTs: Date.now() - 2 * 86400000,
    };
    const matches = findSimilarMatters(retaliationTicket, [weak]);
    expect(matches).toHaveLength(0);
  });
});
