/**
 * Redline renderer — produces a valid .docx carrying REAL Word track-changes
 * revisions (`<w:ins>` / `<w:del>`) for insert/delete segments, plain runs for
 * equal segments, and the governance note.
 */
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { renderRedlineDocx, redlineDocxFilename, type RedlineSegment } from "../src/index";

const SEGMENTS: RedlineSegment[] = [
  { type: "equal", text: "The term of this Agreement shall be " },
  { type: "delete", text: "three (3) years" },
  { type: "insert", text: "one (1) year" },
  { type: "equal", text: " from the Effective Date." },
];

async function documentXml(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  return zip.file("word/document.xml")!.async("string");
}

describe("renderRedlineDocx", () => {
  it("emits w:ins and w:del revisions with author + date attribution", async () => {
    const buf = await renderRedlineDocx({
      title: "Term clause",
      clauseLabel: "Section 3 — Term",
      segments: SEGMENTS,
      author: "AEGIS Redline",
      generatedAt: "2026-10-03T00:00:00.000Z",
      generatedBy: "Harsha",
      rationale: "Shortened the term to one year to match our standard playbook.",
    });

    const xml = await documentXml(buf);
    // Real tracked-changes markup, not just styled text.
    expect(xml).toContain("<w:ins");
    expect(xml).toContain("<w:del");
    // The deletion is carried as delText (what Word shows struck through).
    expect(xml).toContain("three (3) years");
    expect(xml).toContain("one (1) year");
    // Revision metadata present.
    expect(xml).toContain('w:author="AEGIS Redline"');
    expect(xml).toContain('w:date="2026-10-03T00:00:00.000Z"');
    // The unchanged text survives as a normal run.
    expect(xml).toContain("from the Effective Date.");
  });

  it("renders a multi-paragraph redline across newlines", async () => {
    const buf = await renderRedlineDocx({
      title: "Multi",
      segments: [
        { type: "equal", text: "First line.\nSecond line." },
        { type: "insert", text: "\nThird inserted line." },
      ],
      generatedAt: "2026-10-03T00:00:00.000Z",
    });
    const xml = await documentXml(buf);
    const paraCount = (xml.match(/<w:p[ >]/g) ?? []).length;
    // Heading + note + >=3 body paragraphs + footer.
    expect(paraCount).toBeGreaterThanOrEqual(5);
    expect(xml).toContain("Third inserted line.");
  });

  it("defaults the author and still renders with an all-equal (no-op) redline", async () => {
    const buf = await renderRedlineDocx({
      title: "No change",
      segments: [{ type: "equal", text: "Nothing changed here." }],
      generatedAt: "2026-10-03T00:00:00.000Z",
    });
    const xml = await documentXml(buf);
    expect(xml).toContain("Nothing changed here.");
    // No revisions when nothing changed.
    expect(xml).not.toContain("<w:ins");
    expect(xml).not.toContain("<w:del");
  });

  it("builds a safe filename", () => {
    expect(redlineDocxFilename("Section 3 — Term!")).toBe("section-3-term-redline.docx");
    expect(redlineDocxFilename("")).toBe("redline-redline.docx");
  });
});
