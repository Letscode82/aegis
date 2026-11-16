/**
 * Shared Markdown → Word block model (CW-6).
 *
 * A small, PURE parser that turns light Markdown — the shape our AI drafter and
 * console emit — into a structured block list, plus a renderer that maps blocks
 * to docx paragraphs. Used by both `renderContractDocx` (contract body) and
 * `renderMarkdownDocx` (free-form drafts) so a contract downloaded from AEGIS
 * reads like a professionally formatted agreement, not raw text with literal
 * `**` marks.
 *
 * Supported: `#`..`######` headings, whole-line bold section headers
 * (`**1. DEFINITIONS**`), `-`/`*` bullets, horizontal rules (`---` / `***` /
 * `___`), numbered clause lines (`1.`, `1.1`, `2.3)`) with depth-based indent,
 * blank-line paragraphs, and inline `**bold**` / `*italic*`. Everything else is
 * plain text, so the output is always well-formed.
 */
import { BorderStyle, HeadingLevel, type IParagraphOptions, Paragraph, TextRun } from "docx";

const NAVY = "1B2A4A";

export interface InlineSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export type MdBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "section"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "hr" }
  | { kind: "para"; text: string; indent: number };

/** Split a line into inline spans, honoring `**bold**` and `*italic*`. Pure. */
export function parseInlineSpans(input: string): InlineSpan[] {
  const text = String(input ?? "");
  const spans: InlineSpan[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*\n]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) spans.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) spans.push({ text: m[1], bold: true });
    else spans.push({ text: m[2] as string, italic: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) spans.push({ text: text.slice(last) });
  return spans.length ? spans : [{ text: "" }];
}

const HR = /^([-_*])\1{2,}$/;
const ATX = /^(#{1,6})\s+(.*)$/;
const SECTION = /^\*\*(.+?)\*\*:?$/; // whole line wrapped in bold → a heading
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^(\d+(?:\.\d+)*)[.)]?\s+\S/; // 1. / 1.1 / 2.3) ...

/** Parse light Markdown into a structured block list. Pure. */
export function parseMarkdownBlocks(input: string): MdBlock[] {
  const lines = String(input ?? "").replace(/\r\n/g, "\n").split("\n");
  const out: MdBlock[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (!buf.length) return;
    const text = buf.join(" ").replace(/\s+/g, " ").trim();
    if (text) out.push({ kind: "para", text, indent: 0 });
    buf = [];
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const t = line.trim();
    if (t === "") { flush(); continue; }
    if (HR.test(t)) { flush(); out.push({ kind: "hr" }); continue; }
    const atx = ATX.exec(t);
    if (atx) { flush(); out.push({ kind: "heading", level: Math.min((atx[1] ?? "#").length, 6), text: (atx[2] ?? "").replace(/\*\*/g, "").trim() }); continue; }
    const sec = SECTION.exec(t);
    if (sec && !/\*\*/.test(sec[1] ?? "") && (sec[1] ?? "").length <= 90) { flush(); out.push({ kind: "section", text: (sec[1] ?? "").trim() }); continue; }
    const bul = BULLET.exec(line);
    if (bul) { flush(); out.push({ kind: "bullet", text: bul[1] ?? "" }); continue; }
    const num = NUMBERED.exec(t);
    if (num) { flush(); const depth = ((num[1] ?? "").match(/\./g) || []).length; out.push({ kind: "para", text: t, indent: Math.min(depth, 4) }); continue; }
    buf.push(t);
  }
  flush();
  return out;
}

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6,
];

/** Map parsed blocks to docx paragraphs with contract-grade styling. */
export function renderBlocksToParagraphs(blocks: MdBlock[], opts: { baseSize?: number } = {}): Paragraph[] {
  const size = opts.baseSize ?? 21;
  const runs = (text: string): TextRun[] =>
    parseInlineSpans(text).map((s) => new TextRun({ text: s.text, size, bold: s.bold, italics: s.italic }));
  return blocks.map((b): Paragraph => {
    if (b.kind === "hr") {
      return new Paragraph({ spacing: { before: 80, after: 80 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "C8CDD6", space: 1 } }, children: [new TextRun({ text: "" })] });
    }
    if (b.kind === "heading") {
      const lvl = HEADING_LEVELS[Math.min(b.level, 6) - 1] ?? HeadingLevel.HEADING_2;
      const hsize = b.level <= 1 ? 28 : b.level === 2 ? 25 : 23;
      return new Paragraph({ heading: lvl, spacing: { before: 220, after: 90 }, children: [new TextRun({ text: b.text, bold: true, color: NAVY, size: hsize })] });
    }
    if (b.kind === "section") {
      return new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 180, after: 70 }, children: [new TextRun({ text: b.text, bold: true, color: NAVY, size: 23 })] });
    }
    if (b.kind === "bullet") {
      return new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: runs(b.text) });
    }
    const paraOpts: IParagraphOptions = {
      spacing: { after: 90 },
      children: runs(b.text),
      ...(b.indent ? { indent: { left: b.indent * 360 } } : {}),
    };
    return new Paragraph(paraOpts);
  });
}
