import { describe, it, expect } from "vitest";
import { selectKeywordCullIds, selectSourceTypeCullIds, selectDateWindowCullIds, JUNK_PATTERNS } from "../src/cull";

const it_ = (id: string, p: Partial<{ title: string; excerpt: string | null; sourceType: string }>) => ({ id, title: "", excerpt: null, ...p });

describe("selectKeywordCullIds", () => {
  it("matches title or excerpt, case-insensitive", () => {
    const items = [
      it_("a", { title: "Please UNSUBSCRIBE here" }),
      it_("b", { title: "Deal terms", excerpt: "no-reply notification" }),
      it_("c", { title: "Real substantive email" }),
    ];
    expect(selectKeywordCullIds(items, ["unsubscribe", "no-reply"]).sort()).toEqual(["a", "b"]);
  });

  it("returns nothing for empty / blank patterns", () => {
    const items = [it_("a", { title: "x" })];
    expect(selectKeywordCullIds(items, [])).toEqual([]);
    expect(selectKeywordCullIds(items, ["", "  "])).toEqual([]);
  });

  it("ships sensible junk starters", () => {
    expect(JUNK_PATTERNS).toContain("unsubscribe");
    expect(JUNK_PATTERNS.length).toBeGreaterThan(4);
  });
});

describe("selectDateWindowCullIds", () => {
  const items = [
    { id: "before", sentAt: "2025-12-01T00:00:00Z" },
    { id: "inside", sentAt: "2026-02-15T00:00:00Z" },
    { id: "after", sentAt: "2026-05-01T00:00:00Z" },
    { id: "undated", sentAt: null },
  ];
  it("selects dated items outside the inclusive window; never undated", () => {
    expect(selectDateWindowCullIds(items, { after: "2026-01-01", before: "2026-03-31" }).sort()).toEqual(["after", "before"]);
  });
  it("supports an open-ended lower bound", () => {
    expect(selectDateWindowCullIds(items, { after: "2026-01-01" })).toEqual(["before"]);
  });
  it("returns nothing when no bounds are given", () => {
    expect(selectDateWindowCullIds(items, {})).toEqual([]);
  });
  it("accepts Date objects too", () => {
    expect(selectDateWindowCullIds([{ id: "d", sentAt: new Date("2020-01-01T00:00:00Z") }], { after: "2026-01-01" })).toEqual(["d"]);
  });
});

describe("selectSourceTypeCullIds", () => {
  it("selects items of the chosen source types, case-insensitive", () => {
    const items = [
      it_("a", { sourceType: "TEAMS" }),
      it_("b", { sourceType: "MAILBOX" }),
      it_("c", { sourceType: "teams" }),
    ];
    expect(selectSourceTypeCullIds(items, ["TEAMS"]).sort()).toEqual(["a", "c"]);
  });

  it("returns nothing for an empty source list", () => {
    expect(selectSourceTypeCullIds([it_("a", { sourceType: "TEAMS" })], [])).toEqual([]);
  });
});
