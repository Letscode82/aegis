/**
 * Redline (track-changes) Word (.docx) rendering (C-1).
 *
 * Turns an ordered list of redline segments — equal / insert / delete, the same
 * shape `diffWords` (CTR-16) produces — into a Word document with REAL
 * track-changes revisions (`<w:ins>` / `<w:del>`), so counsel opens it in Word,
 * sees the proposed insertions and deletions exactly as Word renders a redline,
 * and accepts or rejects each one. This is the download side of the Word add-in:
 * the add-in applies the same segments in-place via Office.js; this renderer is
 * the offline / email-it-to-the-counterparty artifact.
 *
 * Every revision is attributed to one author + timestamp so the provenance of a
 * machine-proposed change is visible in Word's reviewing pane. The human still
 * accepts each change — the .docx is a suggestion, not an applied edit.
 *
 * Server-only (Node Buffer). Pure given its inputs (author + timestamp passed
 * in) so the output is deterministic and testable.
 */
import {
  DeletedTextRun,
  Document,
  HeadingLevel,
  InsertedTextRun,
  Packer,
  Paragraph,
  TextRun,
  type ParagraphChild,
} from "docx";

const NAVY = "1B2A4A";
const GREY = "5B6472";
const AMBER = "9A6A00";

/** One track-changes segment: unchanged text, an insertion, or a deletion. */
export type RedlineSegmentType = "equal" | "insert" | "delete";
export interface RedlineSegment {
  type: RedlineSegmentType;
  text: string;
}

export interface RedlineDocInput {
  /** Document title (e.g. the contract or clause title). */
  title: string;
  /** Optional clause/section label rendered as a sub-heading above the redline. */
  clauseLabel?: string | null;
  /** The ordered track-changes segments (equal / insert / delete). */
  segments: RedlineSegment[];
  /** Revision author shown in Word's reviewing pane. Defaults to "OneLegal Redline". */
  author?: string | null;
  /** ISO string — passed in so rendering stays deterministic. */
  generatedAt: string;
  /** Reviewer / actor name for the footer, if known. */
  generatedBy?: string | null;
  /** Optional plain-language rationale rendered as a note under the redline. */
  rationale?: string | null;
}

const DEFAULT_AUTHOR = "OneLegal Redline";

const heading1 = (text: string): Paragraph =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 120 },
    children: [new TextRun({ text, bold: true, color: NAVY, size: 30 })],
  });

const heading2 = (text: string): Paragraph =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, color: NAVY, size: 24 })],
  });

const note = (text: string, color = GREY): Paragraph =>
  new Paragraph({
    spacing: { before: 80, after: 80 },
    children: [new TextRun({ text, color, italics: true, size: 18 })],
  });

/**
 * Build one `ParagraphChild` run for a segment chunk (no embedded newline).
 * Insertions/deletions become real Word revisions attributed to `author`/`date`;
 * `id` is a per-document monotonic revision counter.
 */
function runFor(seg: RedlineSegmentType, text: string, id: number, author: string, date: string): ParagraphChild {
  if (seg === "insert") return new InsertedTextRun({ text, id, author, date, size: 21 });
  if (seg === "delete") return new DeletedTextRun({ text, id, author, date, size: 21 });
  return new TextRun({ text, size: 21 });
}

/**
 * Walk the segments into paragraphs. A `\n` inside any segment ends the current
 * paragraph and starts a new one, so multi-paragraph redlines keep their shape
 * while insertions/deletions remain tracked revisions.
 */
function segmentsToParagraphs(segments: RedlineSegment[], author: string, date: string, idRef: { next: number } = { next: 1 }): Paragraph[] {
  const paras: Paragraph[] = [];
  let current: ParagraphChild[] = [];

  const flush = () => {
    paras.push(new Paragraph({ spacing: { after: 120 }, children: current }));
    current = [];
  };

  for (const segment of segments) {
    if (!segment.text) continue;
    const lines = segment.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const chunk = lines[i] ?? "";
      if (chunk) current.push(runFor(segment.type, chunk, idRef.next++, author, date));
      // A newline between chunks closes the current paragraph.
      if (i < lines.length - 1) flush();
    }
  }
  // Always emit the trailing paragraph (even if empty) so an all-equal or
  // single-line redline still renders a body paragraph.
  flush();
  return paras;
}

/**
 * Render a tracked-changes `.docx` from redline segments. Returns a Node
 * `Buffer` the caller streams as a download.
 */
export function renderRedlineDocx(input: RedlineDocInput): Promise<Buffer> {
  const author = (input.author || DEFAULT_AUTHOR).trim() || DEFAULT_AUTHOR;
  const date = input.generatedAt;

  const children: Paragraph[] = [heading1(input.title || "Redline")];
  if (input.clauseLabel) children.push(heading2(input.clauseLabel));
  children.push(
    note("Proposed redline — open in Word and accept or reject each tracked change. Human review is the gate.", AMBER),
  );

  children.push(...segmentsToParagraphs(input.segments || [], author, date));

  if (input.rationale && input.rationale.trim()) {
    children.push(heading2("Why this redline"));
    for (const line of input.rationale.split("\n")) {
      const t = line.trim();
      if (t) children.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: t, size: 20 })] }));
    }
  }

  const footer = [`Redline generated ${input.generatedAt}`, `by ${author}`];
  if (input.generatedBy) footer.push(`· requested by ${input.generatedBy}`);
  children.push(note(footer.join(" "), GREY));

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

// ── Whole-contract version redline (CLM Stage 3) ──────────────────────
//
// A contract version diff spans many clauses (added / removed / changed). This
// renders ALL of them into ONE track-changes .docx: a clause heading per change
// and its tracked insertions/deletions beneath, reusing the same real `<w:ins>`/
// `<w:del>` revision machinery as the single-clause renderer above. Revision ids
// are threaded across clauses so every revision in the document is unique.

export type ContractRedlineClauseStatus = "added" | "removed" | "changed";

export interface ContractRedlineClause {
  /** Human label for the clause (e.g. "Liability cap"). */
  label: string;
  status: ContractRedlineClauseStatus;
  /** Ordered track-changes segments for this clause. */
  segments: RedlineSegment[];
  /** Optional one-line note (e.g. a non-text field change like "risk MEDIUM → HIGH"). */
  note?: string | null;
}

export interface ContractRedlineDocInput {
  /** Contract title. */
  title: string;
  fromVersion: number;
  toVersion: number;
  counts: { added: number; removed: number; changed: number; unchanged: number };
  clauses: ContractRedlineClause[];
  author?: string | null;
  generatedAt: string;
  generatedBy?: string | null;
}

const STATUS_TAG: Record<ContractRedlineClauseStatus, string> = { added: "ADDED", removed: "REMOVED", changed: "CHANGED" };

/**
 * Render a whole-contract version redline as a single tracked-changes `.docx`.
 * Returns a Node `Buffer` the caller streams as a download.
 */
export function renderContractRedlineDocx(input: ContractRedlineDocInput): Promise<Buffer> {
  const author = (input.author || DEFAULT_AUTHOR).trim() || DEFAULT_AUTHOR;
  const date = input.generatedAt;
  const idRef = { next: 1 }; // one monotonic revision counter for the whole doc

  const children: Paragraph[] = [heading1(`${input.title || "Contract"} — Redline`)];
  const { added, removed, changed, unchanged } = input.counts;
  children.push(note(`v${input.fromVersion} → v${input.toVersion}  ·  +${added} added  −${removed} removed  ~${changed} changed  ·  ${unchanged} unchanged`, GREY));
  children.push(note("Proposed redline — open in Word and accept or reject each tracked change. Human review is the gate.", AMBER));

  if (!input.clauses.length) {
    children.push(note("No clause differences between these versions.", GREY));
  }
  for (const clause of input.clauses) {
    children.push(heading2(`${STATUS_TAG[clause.status]} · ${clause.label}`));
    if (clause.note && clause.note.trim()) children.push(note(clause.note, GREY));
    children.push(...segmentsToParagraphs(clause.segments || [], author, date, idRef));
  }

  const footer = [`Redline generated ${input.generatedAt}`, `by ${author}`];
  if (input.generatedBy) footer.push(`· requested by ${input.generatedBy}`);
  children.push(note(footer.join(" "), GREY));

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

/** A safe download filename for a whole-contract version redline. */
export function contractRedlineDocxFilename(title: string, fromVersion: number, toVersion: number): string {
  const slug = String(title || "contract")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return `${slug || "contract"}-redline-v${fromVersion}-v${toVersion}.docx`;
}

/** A safe download filename for a redline doc. */
export function redlineDocxFilename(title: string): string {
  const slug = String(title || "redline")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "redline"}-redline.docx`;
}
