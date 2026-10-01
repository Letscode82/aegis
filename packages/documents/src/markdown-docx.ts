/**
 * Generic Markdown → Word (.docx) rendering (CW-4).
 *
 * Turns the editable console/canvas draft (light Markdown) into a professional,
 * attorney-grade .docx the reviewer can download, edit in Word, and send back
 * to the business user. Complements the structured `renderAgentDeliverableDocx`
 * / `renderContractDocx` renderers — this one serves free-form drafts (memos,
 * letters, clauses, summaries) that aren't one of the fixed shapes.
 *
 * Supported Markdown: `#`..`######` headings, `-`/`*` bullets, blank-line
 * paragraphs, and inline `**bold**`. Everything else renders as plain text, so
 * the output is always well-formed. Stamped DRAFT — human review stays the gate.
 *
 * Server-only (Node Buffer).
 */
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

export interface MarkdownDocInput {
  title: string;
  markdown: string;
  /** ISO string — passed in (Date.now unavailable in some server contexts). */
  generatedAt: string;
  /** Reviewer / actor name for the footer, if known. */
  generatedBy?: string | null;
}

const NAVY = "1B2A4A";
const AMBER = "9A6A00";
const GREY = "5B6472";

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

/** Split a line into runs, honoring inline **bold**. */
function inlineRuns(text: string, size = 21): TextRun[] {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g).filter((p) => p.length > 0);
  if (parts.length === 0) return [new TextRun({ text: "", size })];
  return parts.map((p) =>
    /^\*\*[^*]+\*\*$/.test(p)
      ? new TextRun({ text: p.slice(2, -2), bold: true, size })
      : new TextRun({ text: p, size }),
  );
}

/** Render light Markdown to a .docx Buffer. */
export async function renderMarkdownDocx(input: MarkdownDocInput): Promise<Buffer> {
  const title = String(input.title || "Document").trim() || "Document";
  const lines = String(input.markdown || "").replace(/\r\n/g, "\n").split("\n");

  const children: Paragraph[] = [
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: title, bold: true, color: NAVY, size: 36 })] }),
    new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: "DRAFT — attorney review required. Not an executed instrument.", italics: true, color: AMBER, size: 18 })],
    }),
  ];

  let para: string[] = [];
  const flush = () => {
    if (para.length === 0) return;
    const text = para.join(" ").replace(/\s+/g, " ").trim();
    if (text) children.push(new Paragraph({ spacing: { after: 120 }, children: inlineRuns(text) }));
    para = [];
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const b = /^\s*[-*]\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const depth = (h[1] ?? "#").length;
      const level = HEADING_LEVELS[Math.min(depth, 6) - 1] ?? HeadingLevel.HEADING_2;
      const htext = (h[2] ?? "").replace(/\*\*/g, "").trim();
      children.push(new Paragraph({ heading: level, spacing: { before: 220, after: 100 }, children: [new TextRun({ text: htext, bold: true, color: NAVY, size: 26 })] }));
    } else if (b) {
      flush();
      children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: inlineRuns(b[1] ?? "") }));
    } else if (line.trim() === "") {
      flush();
    } else {
      para.push(line.trim());
    }
  }
  flush();

  const footer = [`Generated ${input.generatedAt}`];
  if (input.generatedBy) footer.push(`by ${input.generatedBy}`);
  children.push(new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: footer.join(" · "), color: GREY, italics: true, size: 16 })] }));

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

/** A safe download filename for a Markdown-rendered doc. */
export function markdownDocxFilename(title: string): string {
  const slug = String(title || "document").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${slug || "document"}.docx`;
}
