import { describe, it, expect } from "vitest";
import { selectKeywordCullIds, selectSourceTypeCullIds, JUNK_PATTERNS } from "../src/cull";

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
