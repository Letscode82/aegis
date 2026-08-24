import { describe, it, expect } from "vitest";
import { filterHits, describeFilters } from "../src/internal/services/review-set";

const hit = (p: Partial<{ sentAt: string | null; title: string; excerpt: string | null; attachments: Array<{ text?: string | null; name?: string }> }>) => ({
  title: "doc", excerpt: null, sentAt: null, ...p,
});

describe("filterHits", () => {
  it("returns everything when no filters are given", () => {
    const hits = [hit({}), hit({ sentAt: "2026-01-01T00:00:00Z" })];
    expect(filterHits(hits)).toHaveLength(2);
    expect(filterHits(hits, {})).toHaveLength(2);
  });

  it("applies an inclusive date window to dated hits", () => {
    const hits = [
      hit({ title: "before", sentAt: "2025-12-31T23:00:00Z" }),
      hit({ title: "inside", sentAt: "2026-02-15T10:00:00Z" }),
      hit({ title: "after", sentAt: "2026-04-01T00:30:00Z" }),
    ];
    const out = filterHits(hits, { startDate: "2026-01-01", endDate: "2026-03-31" });
    expect(out.map((h) => h.title)).toEqual(["inside"]);
  });

  it("keeps undated hits even when a date window is set (can't drop what it can't date)", () => {
    const hits = [hit({ title: "file", sentAt: null }), hit({ title: "old", sentAt: "2020-01-01T00:00:00Z" })];
    const out = filterHits(hits, { startDate: "2026-01-01" });
    expect(out.map((h) => h.title)).toEqual(["file"]);
  });

  it("keyword-matches title, excerpt, and attachment text/name (case-insensitive OR)", () => {
    const hits = [
      hit({ title: "Pricing model" }),
      hit({ title: "unrelated", excerpt: "discusses SOURCE code" }),
      hit({ title: "invoice", attachments: [{ name: "q3.xlsx", text: "confidential pricing tables" }] }),
      hit({ title: "lunch plans", excerpt: "sandwiches" }),
    ];
    const out = filterHits(hits, { keywords: ["pricing", "source code"] });
    expect(out.map((h) => h.title)).toEqual(["Pricing model", "unrelated", "invoice"]);
  });

  it("ANDs date and keyword filters", () => {
    const hits = [
      hit({ title: "pricing", sentAt: "2026-02-01T00:00:00Z" }),
      hit({ title: "pricing", sentAt: "2020-01-01T00:00:00Z" }),
    ];
    const out = filterHits(hits, { startDate: "2026-01-01", keywords: ["pricing"] });
    expect(out).toHaveLength(1);
  });

  it("ignores blank keywords", () => {
    const hits = [hit({ title: "anything" })];
    expect(filterHits(hits, { keywords: ["", "  "] })).toHaveLength(1);
  });
});

describe("describeFilters", () => {
  it("is empty with no filters", () => {
    expect(describeFilters()).toBe("");
    expect(describeFilters({})).toBe("");
  });
  it("renders a provenance suffix", () => {
    expect(describeFilters({ startDate: "2026-01-01", endDate: "2026-03-31", keywords: ["pricing", "nda"] })).toBe(
      " · filters: from 2026-01-01 · to 2026-03-31 · keywords: pricing, nda",
    );
  });
});
