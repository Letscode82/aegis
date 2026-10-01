/**
 * Generic Markdown → .docx renderer (CW-4) — produces a valid, non-empty .docx
 * that carries the draft's substance, headings, bullets, and the DRAFT stamp.
 */
import { describe, expect, it } from "vitest";
import { renderMarkdownDocx, markdownDocxFilename } from "../src/index";
import { extractDocxText } from "../src/extract";

const MD = [
  "# Engagement Memo",
  "",
  "This confirms the engagement with **Globex Inc** under Delaware law.",
  "",
  "## Key terms",
  "- 2-year term",
  "- Mutual confidentiality",
  "",
  "Please review and return.",
].join("\n");

describe("renderMarkdownDocx", () => {
  it("renders a valid .docx (zip) Buffer", async () => {
    const buf = await renderMarkdownDocx({ title: "Engagement Memo", markdown: MD, generatedAt: "2026-10-01T00:00:00Z", generatedBy: "Harsha G" });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    // .docx is a zip — starts with the PK local-file-header magic.
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("carries the title, headings, bullet text, and the DRAFT stamp", async () => {
    const buf = await renderMarkdownDocx({ title: "Engagement Memo", markdown: MD, generatedAt: "2026-10-01T00:00:00Z" });
    const text = extractDocxText(buf);
    expect(text).toContain("Engagement Memo");
    expect(text).toContain("Key terms");
    expect(text).toContain("2-year term");
    expect(text).toContain("Globex Inc"); // inline **bold** unwrapped to text
    expect(text.toUpperCase()).toContain("DRAFT");
  });

  it("builds a safe download filename", () => {
    expect(markdownDocxFilename("Engagement Memo!")).toBe("engagement-memo.docx");
    expect(markdownDocxFilename("")).toBe("document.docx");
  });

  it("handles empty markdown without throwing", async () => {
    const buf = await renderMarkdownDocx({ title: "Blank", markdown: "", generatedAt: "2026-10-01T00:00:00Z" });
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
  });
});
