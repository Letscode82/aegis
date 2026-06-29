/**
 * Document text extraction (Intake document upload, P4a follow-up).
 *
 * Pure — no DB, no network. Turns an uploaded .txt, .docx, or .pdf
 * buffer into plain text the intake agents can read. Legacy .doc (binary)
 * is out of scope.
 *
 * .docx is a ZIP whose body text lives in `word/document.xml`. We parse
 * the ZIP via its central directory (always carries accurate sizes +
 * offsets, unlike local headers with data descriptors), inflate the one
 * entry we need with Node's zlib, and strip the WordprocessingML down to
 * text. Dependency-free on purpose — no jszip/mammoth to install.
 *
 * .pdf: we extract text from the page content streams (FlateDecode-
 * inflated where needed) by interpreting the text-showing operators
 * (Tj / TJ / ' / "). This covers text-based PDFs (the generated-document
 * case — Word/Docs "Save as PDF", LaTeX, etc.). Scanned/image-only PDFs
 * and exotic CID-font subsets won't yield text — we detect that and fail
 * with an honest message rather than returning gibberish. Dependency-
 * free; a full pdf.js swap is a hardening-phase upgrade.
 */
import { inflateRawSync, inflateSync } from "node:zlib";

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

export type DocumentFormat = "txt" | "docx" | "pdf";

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
    return "pdf";
  }
  if (lower.endsWith(".doc")) {
    throw new UnsupportedDocumentFormatError(
      "Legacy .doc is not supported — save as .docx or paste the text.",
    );
  }
  throw new UnsupportedDocumentFormatError(
    `Unsupported file type "${filename}". Upload a Word (.docx), text (.txt), or PDF file.`,
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

// ── PDF → text ───────────────────────────────────────────────────────

/** Inflate a PDF stream body. PDF FlateDecode is zlib-wrapped; fall back
 * to raw deflate for the occasional header-less stream. Null on failure
 * (e.g. an image stream we don't care about). */
function inflatePdfStream(bytes: Buffer): Buffer | null {
  try { return inflateSync(bytes); } catch { /* try raw */ }
  try { return inflateRawSync(bytes); } catch { return null; }
}

/** Decode a PDF literal-string body (the bytes between `(` and `)`),
 * resolving backslash escapes and octal codes. */
function decodePdfLiteral(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== "\\") { out += c; continue; }
    const n = s[i + 1];
    if (n === undefined) break;
    if (n === "n") { out += "\n"; i++; }
    else if (n === "r") { out += "\r"; i++; }
    else if (n === "t") { out += "\t"; i++; }
    else if (n === "b") { out += "\b"; i++; }
    else if (n === "f") { out += "\f"; i++; }
    else if (n === "(" || n === ")" || n === "\\") { out += n; i++; }
    else if (n === "\n") { i++; } // line-continuation
    else if (n === "\r") { i++; if (s[i + 1] === "\n") i++; }
    else if (n >= "0" && n <= "7") {
      let oct = n; i++;
      for (let k = 0; k < 2; k++) {
        const d = s[i + 1];
        if (d !== undefined && d >= "0" && d <= "7") { oct += d; i++; } else break;
      }
      out += String.fromCharCode(parseInt(oct, 8) & 0xff);
    } else { out += n; i++; }
  }
  return out;
}

function decodePdfHex(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  let out = "";
  for (let i = 0; i + 1 < clean.length; i += 2) {
    out += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16) & 0xff);
  }
  if (clean.length % 2 === 1) out += String.fromCharCode(parseInt(clean.slice(-1) + "0", 16) & 0xff);
  return out;
}

/** Pull readable text out of a single decoded content stream by walking
 * its text-showing operators in order. */
function textFromContentStream(cs: string): string {
  let out = "";
  // Each match is one of: TJ array, (..)Tj/', <..>Tj, or a line-move op.
  const tokenRe =
    /\[((?:\\.|[^\]\\])*)\]\s*TJ|\(((?:\\.|[^()\\])*)\)\s*(?:Tj|'|")|<([0-9A-Fa-f\s]*)>\s*Tj|\b(T\*|Td|TD)\b|\bET\b/g;
  const arrRe = /\(((?:\\.|[^()\\])*)\)|<([0-9A-Fa-f\s]+)>|(-?\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(cs)) !== null) {
    if (m[1] !== undefined) {
      // TJ array: concat strings, treat large negative kerning as a space.
      let a: RegExpExecArray | null;
      arrRe.lastIndex = 0;
      while ((a = arrRe.exec(m[1])) !== null) {
        if (a[1] !== undefined) out += decodePdfLiteral(a[1]);
        else if (a[2] !== undefined) out += decodePdfHex(a[2]);
        else if (a[3] !== undefined && Number(a[3]) <= -100) out += " ";
      }
    } else if (m[2] !== undefined) {
      out += decodePdfLiteral(m[2]);
    } else if (m[3] !== undefined) {
      out += decodePdfHex(m[3]);
    } else {
      out += "\n"; // Td / TD / T* / ET → line break
    }
  }
  return out;
}

const MIN_PDF_TEXT_CHARS = 16;

export function extractPdfText(buf: Buffer): string {
  // latin1 keeps byte values intact for stream slicing + operator scan.
  const raw = buf.toString("latin1");
  if (!raw.startsWith("%PDF-")) {
    throw new DocumentParseError("Not a valid PDF (missing %PDF header).");
  }

  let text = "";
  // Walk every `stream … endstream`. Inflate FlateDecode bodies; pass
  // through already-plain content streams. Non-text streams contribute
  // nothing (no text operators), so they're harmless.
  const streamRe = /stream\r?\n/g;
  let sm: RegExpExecArray | null;
  while ((sm = streamRe.exec(raw)) !== null) {
    const start = sm.index + sm[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    let body = raw.slice(start, end);
    // Trim the single EOL that precedes `endstream`.
    body = body.replace(/\r?\n$/, "");
    const bytes = Buffer.from(body, "latin1");
    const inflated = inflatePdfStream(bytes);
    const cs = inflated ? inflated.toString("latin1") : body;
    if (cs.includes("Tj") || cs.includes("TJ")) {
      text += textFromContentStream(cs) + "\n";
    }
    streamRe.lastIndex = end + "endstream".length;
  }

  const cleaned = text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  if (cleaned.replace(/\s/g, "").length < MIN_PDF_TEXT_CHARS) {
    throw new DocumentParseError(
      "Could not extract text from this PDF — it may be scanned or image-only. " +
        "Upload a Word (.docx) or text (.txt) file, or paste the text.",
    );
  }
  return cleaned;
}

/**
 * Extract plain text from an uploaded document buffer. Throws
 * UnsupportedDocumentFormatError for unsupported types and
 * DocumentParseError when a supported file can't be parsed.
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
  if (format === "pdf") {
    return { format, text: extractPdfText(buf) };
  }
  return { format, text: extractDocxText(buf) };
}
