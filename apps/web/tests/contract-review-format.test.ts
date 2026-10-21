import { describe, it, expect } from "vitest";
import { formatContractReviewMarkdown } from "../lib/one-legal/contract-review";
import type { AddinReview } from "@aegis/contracts";

// Locks in redesign PR 2: the ONE Legal console review renders the SAME graded
// engine result the Contracts workspace shows. These cover the pure formatter —
// the only part with no DB — proving the Markdown carries the structured grade
// (verdict, risk band, per-clause positions) rather than freeform prose.

const review = (over: Partial<AddinReview> = {}): AddinReview => ({
  playbookId: "pb-1",
  summary: {
    standard: 3,
    fallback: 1,
    escalate: 1,
    missing: 0,
    total: 5,
    weightedScore: 72,
    verdict: "Reviewable with two deviations to resolve.",
    riskBand: "MEDIUM",
    ...(over.summary || {}),
  },
  items: over.items ?? [
    {
      clauseType: "LIABILITY_CAP",
      grade: "ESCALATE",
      editKind: "REPLACEMENT",
      ourPosition: "12 months' fees",
      theirPosition: "Unlimited",
      rationale: "Uncapped liability is outside our standard.",
      suggestedText: "Liability capped at fees paid in the prior 12 months.",
    },
    {
      clauseType: "GOVERNING_LAW",
      grade: "FALLBACK",
      editKind: "REPLACEMENT",
      ourPosition: "Delaware",
      theirPosition: "New York",
      rationale: "Acceptable fallback jurisdiction.",
      suggestedText: "This Agreement is governed by the laws of Delaware.",
    },
  ],
  ...over,
});

describe("formatContractReviewMarkdown", () => {
  it("leads with the structured verdict, risk band, and playbook score", () => {
    const md = formatContractReviewMarkdown("Acme MSA.docx", review());
    expect(md).toContain("Bottom line");
    expect(md).toContain("Reviewable with two deviations to resolve.");
    expect(md).toContain("Risk band: **MEDIUM**");
    expect(md).toContain("72/100");
    // the grade distribution comes straight from the structured summary
    expect(md).toContain("3 within standard, 1 fallback, 1 to escalate, 0 missing");
  });

  it("renders each off-standard clause with its grade, positions, and redline", () => {
    const md = formatContractReviewMarkdown("Acme MSA.docx", review());
    expect(md).toContain("**LIABILITY_CAP** — Escalate — outside standard.");
    expect(md).toContain("Our standard position: 12 months' fees");
    expect(md).toContain("Their position: Unlimited");
    expect(md).toContain("Suggested redline: Liability capped at fees paid in the prior 12 months.");
    expect(md).toContain("**GOVERNING_LAW** — Fallback — acceptable with caveats.");
    // points the user to the workspace where decisions are chain-sealed
    expect(md).toContain("Contracts workspace");
  });

  it("reports a clean contract when every clause is within standard", () => {
    const md = formatContractReviewMarkdown("Clean NDA.docx", review({
      summary: {
        standard: 4, fallback: 0, escalate: 0, missing: 0, total: 4,
        weightedScore: 100, verdict: "Within standard throughout.", riskBand: "LOW",
      },
      items: [],
    }));
    expect(md).toContain("within your standard positions — nothing to escalate");
    expect(md).toContain("No redlines needed");
    expect(md).not.toContain("off standard");
  });
});
