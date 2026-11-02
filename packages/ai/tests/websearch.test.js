import { describe, it, expect } from "vitest";
import { extractWebSearchResult, WEB_SEARCH_TOOL_TYPE } from "../src/claude.js";

describe("WEB_SEARCH_TOOL_TYPE", () => {
  it("is the current server-tool variant", () => {
    expect(WEB_SEARCH_TOOL_TYPE).toBe("web_search_20260209");
  });
});

describe("extractWebSearchResult", () => {
  it("concatenates text, collects citations, and uses cited URLs as sources", () => {
    const data = {
      content: [
        {
          type: "web_search_tool_result",
          content: [
            { url: "https://rbi.org.in/dlg", title: "RBI Digital Lending Guidelines" },
            { url: "https://example.com/blog", title: "Some blog" },
          ],
        },
        {
          type: "text",
          text: "Lenders must disclose the APR [1].",
          citations: [{ url: "https://rbi.org.in/dlg", title: "RBI Digital Lending Guidelines", cited_text: "Annual Percentage Rate must be disclosed" }],
        },
      ],
    };
    const r = extractWebSearchResult(data);
    expect(r.text).toBe("Lenders must disclose the APR [1].");
    expect(r.citations).toHaveLength(1);
    expect(r.citations[0].url).toBe("https://rbi.org.in/dlg");
    // Only the CITED url is reported as a source (the blog hit was not cited).
    expect(r.sources).toEqual([{ url: "https://rbi.org.in/dlg", title: "RBI Digital Lending Guidelines" }]);
    expect(r.searchError).toBeNull();
  });

  it("falls back to all search hits when the model cited none", () => {
    const data = {
      content: [
        { type: "web_search_tool_result", content: [{ url: "https://a.gov/x", title: "A" }, { url: "https://b.gov/y", title: "B" }] },
        { type: "text", text: "Draft body with no inline citations." },
      ],
    };
    const r = extractWebSearchResult(data);
    expect(r.sources.map((s) => s.url)).toEqual(["https://a.gov/x", "https://b.gov/y"]);
  });

  it("surfaces a server-tool error object as searchError without throwing", () => {
    const data = {
      content: [
        { type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } },
        { type: "text", text: "Partial draft." },
      ],
    };
    const r = extractWebSearchResult(data);
    expect(r.searchError).toBe("max_uses_exceeded");
    expect(r.text).toBe("Partial draft.");
    expect(r.sources).toEqual([]);
  });

  it("dedupes repeated source URLs", () => {
    const data = {
      content: [
        { type: "web_search_tool_result", content: [{ url: "https://a.gov/x", title: "A" }, { url: "https://a.gov/x", title: "A dup" }] },
        { type: "text", text: "x" },
      ],
    };
    expect(extractWebSearchResult(data).sources).toEqual([{ url: "https://a.gov/x", title: "A" }]);
  });

  it("empty / malformed input → empty result, never throws", () => {
    expect(extractWebSearchResult(null)).toEqual({ text: "", citations: [], sources: [], searchError: null });
    expect(extractWebSearchResult({})).toEqual({ text: "", citations: [], sources: [], searchError: null });
    expect(extractWebSearchResult({ content: "nope" })).toEqual({ text: "", citations: [], sources: [], searchError: null });
  });
});
