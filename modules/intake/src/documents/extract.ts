/**
 * Document text extraction (Intake document upload, P4a follow-up).
 *
 * Pure — no DB, no network. Turns an uploaded .txt or .docx buffer into
 * plain text the intake agents can read. PDF is intentionally out of
 * scope for now (needs a heavier parser); .doc (legacy binary) too.
 *
 * .docx is a ZIP whose body text lives in `word/document.xml`. We parse
 * the ZIP via its central directory (always carries accurate sizes +
 * offsets, unlike local headers with data descriptors), inflate the one
 * entry we need with Node's zlib, and strip the WordprocessingML down to
 * text. Dependency-free on purpose — no jszip/mammoth to install.
 */
import { inflateRawSync } from "node:zlib";

export class UnsupportedDocumentFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedDocumentFormatError";
  }
}

export class DocumentParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentParseError";
  }
}

export type DocumentFormat = "txt" | "docx";

export interface ExtractedDocument {
  format: DocumentFormat;
  text: string;
}

/** Decide the format from filename extension + mime, or reject. */
export function detectFormat(filename: string, mimeType?: string): DocumentFormat {
  const lower = (filename || "").toLowerCase();
  const mt = (mimeType || "").toLowerCase();
  if (lower.endsWith(".docx") ||
      mt === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return "docx";
  }
  if (lower.endsWith(".txt") || lower.endsWith(".text") || lower.endsWith(".md") ||
      mt === "text/plain" || mt === "text/markdown") {
    return "txt";
  }
  if (lower.endsWith(".pdf") || mt === "application/pdf") {
    throw new UnsupportedDocumentFormatError(
      "PDF is not supported yet — please upload a Word (.docx) or text (.txt) file.",
    );
  }
  if (lower.endsWith(".doc")) {
    throw new UnsupportedDocumentFormatError(
      "Legacy .doc is not supported — save as .docx or paste the text.",
    );
  }
  throw new UnsupportedDocumentFormatError(
    `Unsupported file type "${filename}". Upload a Word (.docx) or text (.txt) file.`,
  );
}

// ── ZIP (central-directory) reader, just enough for one entry ─────────

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

function findEocd(buf: Buffer): number {
  // EOCD is at the end; scan back over the (max 64KB) comment field.
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

/** Read one named entry's decompressed bytes from a ZIP buffer. */
function readZipEntry(buf: Buffer, wanted: string): Buffer | null {
  const eocd = findEocd(buf);
  if (eocd < 0) throw new DocumentParseError("Not a valid .docx (no ZIP end record).");
  const entries = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // central directory offset

  for (let n = 0; n < entries; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    if (name === wanted) {
      if (buf.readUInt32LE(localOff) !== LOC_SIG) {
        throw new DocumentParseError("Corrupt .docx (bad local header).");
      }
      const locNameLen = buf.readUInt16LE(localOff + 26);
      const locExtraLen = buf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + locNameLen + locExtraLen;
      const raw = buf.subarray(dataStart, dataStart + compSize);
      if (method === 0) return Buffer.from(raw); // stored
      if (method === 8) return inflateRawSync(raw); // deflate
      throw new DocumentParseError(`Unsupported ZIP compression method ${method}.`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

// ── WordprocessingML → text ──────────────────────────────────────────

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&"); // last, so "&amp;lt;" → "&lt;" not "<"
}

/** Strip document.xml to readable text: paragraphs → newlines, tabs and
 * breaks preserved, all other tags removed, entities decoded. */
export function docxXmlToText(xml: string): string {
  let s = xml;
  s = s.replace(/<w:tab\b[^>]*\/?>/g, "\t");
  s = s.replace(/<w:br\b[^>]*\/?>/g, "\n");
  s = s.replace(/<\/w:p>/g, "\n"); // end of paragraph
  s = s.replace(/<[^>]+>/g, ""); // drop every remaining tag
  s = decodeXmlEntities(s);
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n"); // tidy
  return s.trim();
}

export function extractDocxText(buf: Buffer): string {
  const xmlBuf = readZipEntry(buf, "word/document.xml");
  if (!xmlBuf) throw new DocumentParseError("No word/document.xml in the .docx.");
  return docxXmlToText(xmlBuf.toString("utf8"));
}

/**
 * Extract plain text from an uploaded document buffer. Throws
 * UnsupportedDocumentFormatError for anything but .txt / .docx.
 */
export function extractDocumentText(
  filename: string,
  mimeType: string | undefined,
  buf: Buffer,
): ExtractedDocument {
  const format = detectFormat(filename, mimeType);
  if (format === "txt") {
    return { format, text: buf.toString("utf8").trim() };
  }
  return { format, text: extractDocxText(buf) };
}
