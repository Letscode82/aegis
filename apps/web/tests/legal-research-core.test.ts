import { describe, it, expect } from "vitest";
import {
  LEGAL_RESEARCH_SYSTEM,
  buildGroundedContext,
  extractiveAnswer,
  inferJurisdiction,
  type ResearchSource,
} from "../lib/one-legal/legal-research-core";

// C-4 — pure core of the legal-authority research capability. These lock the
// numbered-context shape the grounding prompt cites, the offline extractive
// fallback, and the jurisdiction inference the orchestrator keys off.

const SOURCES: ResearchSource[] = [
  {
    n: 1,
    id: "c1",
    provider: "courtlistener",
    providerLabel: "CourtListener",
    type: "caselaw",
    title: "Carpenter v. United States",
    citation: "138 S. Ct. 2206",
    authority: "Supreme Court",
    jurisdiction: "US",
    date: "2018-06-22",
    snippet: "Government access to cell-site records is a Fourth Amendment search.",
  },
  {
    n: 2,
    id: "c2",
    provider: "eurlex",
    providerLabel: "EUR-Lex",
    type: "eu-law",
    title: "General Data Protection Regulation",
    citation: "CELEX 32016R0679",
    authority: "European Union",
    jurisdiction: "EU",
    date: "2016-04-27",
    snippet: "Regulation on the protection of natural persons with regard to personal data.",
  },
];

describe("LEGAL_RESEARCH_SYSTEM", () => {
  it("instructs inline [n] citation and forbids inventing authorities", () => {
    expect(LEGAL_RESEARCH_SYSTEM).toMatch(/\[n\]/);
    expect(LEGAL_RESEARCH_SYSTEM.toLowerCase()).toContain("do not invent");
    expect(LEGAL_RESEARCH_SYSTEM.toLowerCase()).toContain("not definitive legal advice");
  });
});

describe("buildGroundedContext", () => {
  it("numbers each authority and includes its citation + date header", () => {
    const ctx = buildGroundedContext(SOURCES);
    expect(ctx).toContain("[1] Carpenter v. United States · 138 S. Ct. 2206 · Supreme Court · 2018-06-22");
    expect(ctx).toContain("[2] General Data Protection Regulation · CELEX 32016R0679");
    expect(ctx).toContain("Fourth Amendment search");
  });
});

describe("extractiveAnswer", () => {
  it("lists the authorities with their citation and [n], and flags AI-offline", () => {
    const a = extractiveAnswer(SOURCES);
    expect(a).toContain("Carpenter v. United States (138 S. Ct. 2206) [1]");
    expect(a).toContain("[2]");
    expect(a.toLowerCase()).toContain("ai synthesis is offline");
  });
});

describe("inferJurisdiction", () => {
  it("picks EU for GDPR / EU phrasing", () => {
    expect(inferJurisdiction("What does the GDPR require for erasure?")).toBe("EU");
    expect(inferJurisdiction("Latest CJEU directive on data transfers")).toBe("EU");
  });
  it("picks US for US-specific phrasing", () => {
    expect(inferJurisdiction("SCOTUS ruling on cell-site data")).toBe("US");
    expect(inferJurisdiction("Which CFR section governs 10b-5?")).toBe("US");
  });
  it("returns undefined when nothing is named or both appear", () => {
    expect(inferJurisdiction("reasonable expectation of privacy")).toBeUndefined();
    expect(inferJurisdiction("Compare US federal law and EU GDPR")).toBeUndefined();
  });
});
