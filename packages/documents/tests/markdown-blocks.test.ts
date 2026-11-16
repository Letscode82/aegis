import { describe, it, expect } from "vitest";
import { parseInlineSpans, parseMarkdownBlocks } from "../src/markdown-blocks";

describe("parseInlineSpans", () => {
  it("splits bold and italic runs", () => {
    const s = parseInlineSpans('This **Agreement** is *executed* today.');
    expect(s).toEqual([
      { text: "This " },
      { text: "Agreement", bold: true },
      { text: " is " },
      { text: "executed", italic: true },
      { text: " today." },
    ]);
  });
  it("leaves plain text as a single span", () => {
    expect(parseInlineSpans("no markup here")).toEqual([{ text: "no markup here" }]);
  });
  it("never returns an empty array", () => {
    expect(parseInlineSpans("")).toEqual([{ text: "" }]);
  });
});

describe("parseMarkdownBlocks", () => {
  it("classifies headings, section headers, rules, bullets and numbered clauses", () => {
    const md = [
      "# Master Agreement",
      "",
      "**RECITALS**",
      "",
      "A. The parties agree as follows.",
      "",
      "---",
      "",
      "**1. DEFINITIONS**",
      "",
      '1.1 "Borrower" means a customer.',
      "1.2 \"APR\" means the rate.",
      "",
      "- first point",
      "- second point",
    ].join("\n");
    const blocks = parseMarkdownBlocks(md);
    const kinds = blocks.map((b) => b.kind);
    expect(kinds).toEqual(["heading", "section", "para", "hr", "section", "para", "para", "bullet", "bullet"]);

    expect(blocks[0]).toEqual({ kind: "heading", level: 1, text: "Master Agreement" });
    expect(blocks[1]).toEqual({ kind: "section", text: "RECITALS" });
    // numbered sub-clauses carry depth-based indent
    const c11 = blocks.find((b) => b.kind === "para" && b.text.startsWith("1.1"));
    expect(c11).toMatchObject({ kind: "para", indent: 1 });
  });

  it("merges wrapped prose lines into one paragraph but keeps a numbered line separate", () => {
    const md = "This is a long sentence\nthat wraps across lines.\n\n2. A numbered clause.";
    const blocks = parseMarkdownBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ kind: "para", text: "This is a long sentence that wraps across lines.", indent: 0 });
    expect(blocks[1]).toEqual({ kind: "para", text: "2. A numbered clause.", indent: 0 });
  });

  it("treats *** / ___ as horizontal rules", () => {
    expect(parseMarkdownBlocks("***").map((b) => b.kind)).toEqual(["hr"]);
    expect(parseMarkdownBlocks("___").map((b) => b.kind)).toEqual(["hr"]);
  });

  it("empty input yields no blocks", () => {
    expect(parseMarkdownBlocks("")).toEqual([]);
  });
});
