/**
 * Best-effort attachment / file text extraction (CW-1). Turns a downloaded
 * attachment's bytes into review-searchable text so the AI review, keyword
 * highlighting, and coding can see INSIDE documents — not just their filenames.
 * Text/CSV/JSON/XML/HTML decode directly (zero dependency); PDF (pdf-parse) and
 * DOCX (mammoth) are extracted via degrade-safe dynamic import — if the parser
 * is unavailable or throws, the item simply keeps its filename. Image OCR
 * (scanned pages) needs a cloud OCR service (e.g. Azure Document Intelligence)
 * and is a documented follow-up. Everything is wrapped: any failure returns
 * null and the item keeps its filename.
 */
const MAX_BYTES = 8 * 1024 * 1024; // don't try to parse very large attachments
const MAX_TEXT = 8000; // cap stored excerpt length

function clean(s: string): string | null {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, MAX_TEXT) : null;
}

/** Strip HTML to plain text (for full email bodies collected as HTML). */
export function htmlToText(html: string | null | undefined): string | null {
  if (!html) return null;
  const t = html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#39;/g, "'").replace(/&quot;/gi, '"');
  return clean(t);
}

/** Extract text from a PDF buffer via pdf-parse v2 (dynamic, degrade-safe). */
async function extractPdf(buf: Buffer): Promise<string | null> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    const res = await parser.getText();
    return clean(res?.text ?? "");
  } catch {
    return null;
  }
}

/** Extract text from a DOCX buffer via mammoth (dynamic, degrade-safe). */
async function extractDocx(buf: Buffer): Promise<string | null> {
  try {
    const mammoth = (await import("mammoth")) as unknown as { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> };
    const r = await mammoth.extractRawText({ buffer: buf });
    return clean(r?.value ?? "");
  } catch {
    return null;
  }
}

/** Magic-byte sniff as a fallback when the contentType is missing/generic. */
function sniff(buf: Buffer): "pdf" | "zip" | null {
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "pdf"; // %PDF
  if (buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b) return "zip"; // PK.. (docx is a zip)
  return null;
}

/** Extract text from a base64 attachment body — text, PDF, and DOCX.
 *  Returns null when unsupported or on any error — callers keep the filename. */
export async function extractAttachmentText(contentType: string | null | undefined, contentBytesB64: string | null | undefined): Promise<string | null> {
  if (!contentBytesB64) return null;
  let buf: Buffer;
  try { buf = Buffer.from(contentBytesB64, "base64"); } catch { return null; }
  if (buf.length === 0 || buf.length > MAX_BYTES) return null;
  const ct = (contentType || "").toLowerCase();
  try {
    if (ct.startsWith("text/") || ct.includes("json") || ct.includes("xml") || ct.includes("csv") || ct.includes("html") || ct.includes("rtf")) {
      const raw = buf.toString("utf8");
      return ct.includes("html") ? htmlToText(raw) : clean(raw);
    }
    const magic = sniff(buf);
    if (ct.includes("pdf") || magic === "pdf") return await extractPdf(buf);
    if (ct.includes("wordprocessingml") || ct.includes("msword") || ct.endsWith("docx")) return await extractDocx(buf);
    // A generic zip that is actually a .docx (Office Open XML) — try DOCX.
    if (magic === "zip" && (ct === "" || ct.includes("zip") || ct.includes("octet-stream"))) return await extractDocx(buf);
  } catch { return null; }
  return null;
}
