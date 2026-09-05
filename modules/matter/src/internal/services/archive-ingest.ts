/**
 * PROC-6 (increment 1) — archive ingest: ZIP + MBOX → ReviewSetItems.
 *
 * Lets a client hand over an exported archive (a ZIP of documents, or an MBOX
 * mail export) and turns it into a review set via the same `persistReviewSet`
 * seam the M365 collector uses — so contentHash / language / exception land
 * consistently. Pure-JS (jszip + a compact MBOX parser); no native binaries.
 *
 * Serverless reality (documented limit): the archive is POSTed inline, so it's
 * capped well under Vercel's request limit. Large archives (GBs) need a
 * Blob-upload + worker path — the same limitation family as the Purview export
 * download. PST is increment 2 (pst-extractor).
 */
import { persistReviewSet, type ReviewCollectedItem, type ReviewSetSummary } from "@aegis/review";
import { nativeProcessingEngine } from "./processing";
import { htmlToText } from "./text-extract";

export type IngestActor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

export interface IngestArchiveInput {
  fileName: string;
  contentType?: string | null;
  /** base64 of the archive bytes. */
  bytesB64: string;
  matterId?: string | null;
  name?: string | null;
}

/** ~3.5 MB archive cap — base64 inflates ~33%, keeping the POST under Vercel's ~4.5 MB request limit. */
export const MAX_ARCHIVE_BYTES = 3_500_000;
const MAX_ITEMS = 500;

// ── MBOX parsing (compact, best-effort) ─────────────────────────────
export interface ParsedEmail {
  subject: string;
  from: string | null;
  to: string | null;
  date: string | null;
  body: string;
  attachmentNames: string[];
}

function decodeCTE(body: string, cte: string | null): string {
  const enc = (cte ?? "").toLowerCase();
  try {
    if (enc.includes("base64")) return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
    if (enc.includes("quoted-printable")) {
      return body
        .replace(/=\r?\n/g, "")
        .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    }
  } catch { /* fall through to raw */ }
  return body;
}

function splitHeadersBody(block: string): { headers: string; body: string } {
  const m = block.match(/\r?\n\r?\n/);
  if (m == null || m.index === undefined) return { headers: block, body: "" };
  const sepLen = m[0]?.length ?? 2;
  return { headers: block.slice(0, m.index), body: block.slice(m.index + sepLen) };
}

function headerValue(headers: string, name: string): string | null {
  // Unfold folded headers, then match "Name: value".
  const unfolded = headers.replace(/\r?\n[ \t]+/g, " ");
  const re = new RegExp(`^${name}:\\s*(.*)$`, "im");
  const m = unfolded.match(re);
  return m?.[1]?.trim() ?? null;
}

function parseMessage(block: string): ParsedEmail {
  const { headers, body } = splitHeadersBody(block);
  const subject = headerValue(headers, "Subject") ?? "(no subject)";
  const from = headerValue(headers, "From");
  const to = headerValue(headers, "To");
  const dateRaw = headerValue(headers, "Date");
  let date: string | null = null;
  if (dateRaw) { const t = Date.parse(dateRaw); if (!Number.isNaN(t)) date = new Date(t).toISOString(); }

  const contentType = headerValue(headers, "Content-Type") ?? "text/plain";
  const cte = headerValue(headers, "Content-Transfer-Encoding");
  const attachmentNames: string[] = [];
  let text = "";

  const boundary = contentType.match(/boundary="?([^";]+)"?/i)?.[1];
  if (/multipart\//i.test(contentType) && boundary) {
    const parts = body.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:--)?\\s*\\n`));
    for (const part of parts) {
      if (!part.trim()) continue;
      const { headers: ph, body: pb } = splitHeadersBody(part);
      const pType = headerValue(ph, "Content-Type") ?? "";
      const pDisp = headerValue(ph, "Content-Disposition") ?? "";
      const pCte = headerValue(ph, "Content-Transfer-Encoding");
      const fname = (pDisp + " " + pType).match(/name="?([^";]+)"?/i)?.[1];
      if (/attachment/i.test(pDisp) || (fname && !/text\//i.test(pType))) {
        if (fname) attachmentNames.push(fname);
        continue;
      }
      if (/text\/plain/i.test(pType) && !text) text = decodeCTE(pb, pCte).trim();
      else if (/text\/html/i.test(pType) && !text) text = htmlToText(decodeCTE(pb, pCte)) ?? "";
    }
  } else {
    const decoded = decodeCTE(body, cte);
    text = /text\/html/i.test(contentType) ? (htmlToText(decoded) ?? "") : decoded.trim();
  }

  return { subject, from, to, date, body: text, attachmentNames };
}

/** Split an MBOX into messages on the "From " separator line, then parse each. */
export function parseMbox(mbox: string): ParsedEmail[] {
  const normalized = mbox.replace(/\r\n/g, "\n");
  // Messages start at a line beginning with "From " (mbox separator).
  const chunks = normalized.split(/\n(?=From )/g).map((c) => c.replace(/^From .*\n/, "")).filter((c) => c.trim());
  return chunks.map(parseMessage);
}

// ── Orchestration ───────────────────────────────────────────────────
function extFor(name: string): string {
  return name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}
function contentTypeForExt(ext: string): string {
  const map: Record<string, string> = {
    pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain", csv: "text/csv", json: "application/json", html: "text/html", htm: "text/html", xml: "text/xml",
  };
  return map[ext] ?? "application/octet-stream";
}

async function ingestZip(buf: Buffer): Promise<ReviewCollectedItem[]> {
  const JSZipMod = (await import("jszip")) as unknown as {
    default: { loadAsync: (b: Buffer) => Promise<{ files: Record<string, { dir: boolean; async: (t: "base64") => Promise<string> }> }> };
  };
  const zip = await JSZipMod.default.loadAsync(buf);
  const engine = nativeProcessingEngine();
  const items: ReviewCollectedItem[] = [];
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    if (items.length >= MAX_ITEMS) break;
    const ext = extFor(name);
    const contentBytesB64 = await entry.async("base64");
    const { text, exception } = await engine.extract({ filename: name, contentType: contentTypeForExt(ext), contentBytesB64 });
    items.push({
      sourceType: "FILE",
      sourceSystem: "upload:zip",
      title: name,
      excerpt: text,
      exception: exception?.code ?? null,
    });
  }
  return items;
}

function ingestMbox(text: string): ReviewCollectedItem[] {
  return parseMbox(text).slice(0, MAX_ITEMS).map((m) => ({
    sourceType: "EMAIL",
    sourceSystem: "upload:mbox",
    title: m.subject,
    excerpt: m.body || null,
    sentAt: m.date,
    attachments: m.attachmentNames.map((n) => ({ name: n, text: null })),
  }));
}

function detectKind(fileName: string, buf: Buffer): "zip" | "mbox" | null {
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)) return "zip";
  const ext = extFor(fileName);
  if (ext === "zip") return "zip";
  if (ext === "mbox" || ext === "eml") return "mbox";
  // Heuristic: looks like an email header block.
  const head = buf.subarray(0, 256).toString("latin1");
  if (/^From /m.test(head) || /^(Subject|From|To|Date):/im.test(head)) return "mbox";
  return null;
}

/** Ingest an uploaded ZIP or MBOX into a new review set on the matter. */
export async function ingestArchive(
  organizationId: string,
  input: IngestArchiveInput,
  actor: IngestActor,
): Promise<ReviewSetSummary> {
  let buf: Buffer;
  try {
    buf = Buffer.from(input.bytesB64, "base64");
  } catch {
    throw new Error("Archive bytes are not valid base64.");
  }
  if (buf.length === 0) throw new Error("Empty upload.");
  if (buf.length > MAX_ARCHIVE_BYTES) {
    throw new Error(`Archive is ${buf.length} bytes, over the ${MAX_ARCHIVE_BYTES}-byte inline cap — larger archives need the Blob-upload/worker path.`);
  }

  const kind = detectKind(input.fileName, buf);
  if (!kind) throw new Error(`Unsupported archive "${input.fileName}". Supported in this release: .zip, .mbox (PST is coming).`);

  const items = kind === "zip" ? await ingestZip(buf) : ingestMbox(buf.toString("utf8"));
  if (items.length === 0) throw new Error("No items found in the archive.");

  return persistReviewSet(
    organizationId,
    {
      origin: "ADHOC",
      name: (input.name || "").trim() || `Ingest: ${input.fileName}`,
      queryString: `archive:${input.fileName} (${kind}, ${items.length} item${items.length === 1 ? "" : "s"})`,
      sources: ["ARCHIVE"],
      matterId: input.matterId ?? null,
      custodianCount: 0,
      simulated: false,
    },
    items,
    actor,
  );
}
