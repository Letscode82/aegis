import { describe, it, expect } from "vitest";
import { extractKeywords, buildKql, draftCollectionQuery } from "../src/internal/services/collection-query";

describe("extractKeywords", () => {
  it("keeps quoted phrases and significant words, drops stopwords", () => {
    const k = extractKeywords('find all emails about "wire transfer" and vendor kickbacks');
    expect(k).toContain("wire transfer");
    expect(k).toContain("vendor");
    expect(k).toContain("kickbacks");
    expect(k).not.toContain("emails");
    expect(k).not.toContain("about");
  });
  it("caps and de-dupes", () => {
    expect(extractKeywords("alpha alpha beta gamma delta epsilon zeta eta", 3)).toHaveLength(3);
  });
});

describe("buildKql", () => {
  it("combines participants, keywords and date bounds with AND", () => {
    const q = buildKql({ keywords: ["invoice", "kickback"], custodianEmails: ["a@x.com", "b@x.com"], dateFrom: "2026-01-01", dateTo: "2026-06-30" });
    expect(q).toBe('(participants:"a@x.com" OR participants:"b@x.com") AND (invoice OR kickback) AND date>=2026-01-01 AND date<=2026-06-30');
  });
  it("quotes multi-word keywords", () => {
    expect(buildKql({ keywords: ["wire transfer"] })).toBe('("wire transfer")');
  });
  it("falls back to * with no scope", () => {
    expect(buildKql({ keywords: [] })).toBe("*");
  });
  it("ignores malformed dates", () => {
    expect(buildKql({ keywords: ["x"], dateFrom: "not-a-date" })).toBe("(x)");
  });
});

describe("draftCollectionQuery", () => {
  it("drafts from NL + custodians and explains", () => {
    const d = draftCollectionQuery({ naturalLanguage: "invoices from vendorx", custodianEmails: ["cfo@x.com"] });
    expect(d.source).toBe("deterministic");
    expect(d.queryString).toContain('participants:"cfo@x.com"');
    expect(d.queryString).toContain("invoices");
    expect(d.rationale).toMatch(/custodian participant/);
  });
});
