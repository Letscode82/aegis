/**
 * Best-effort attachment / file text extraction (CW-1). Turns a downloaded
 * attachment's bytes into review-searchable text so the AI review, keyword
 * highlighting, and coding can see INSIDE text-based documents — not just their
 * filenames. Text/CSV/JSON/XML/HTML decode directly here (zero dependency);
 * PDF/DOCX extraction lands in a follow-up (needs a parser dep + Next external
 * config, validated on a tenant). Everything is wrapped: any failure returns
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

/** Extract text from a base64 attachment body (text-based types today).
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
  } catch { return null; }
  return null;
}
