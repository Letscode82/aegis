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
import { Document, Packer, Paragraph, TextRun } from "docx";
import { parseMarkdownBlocks, renderBlocksToParagraphs } from "./markdown-blocks";

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

/** Render light Markdown to a .docx Buffer. */
export async function renderMarkdownDocx(input: MarkdownDocInput): Promise<Buffer> {
  const title = String(input.title || "Document").trim() || "Document";

  const children: Paragraph[] = [
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: title, bold: true, color: NAVY, size: 36 })] }),
    new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: "DRAFT — attorney review required. Not an executed instrument.", italics: true, color: AMBER, size: 18 })],
    }),
    ...renderBlocksToParagraphs(parseMarkdownBlocks(input.markdown)),
  ];

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
