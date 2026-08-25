/**
 * PROC-1 — the pluggable Processing Engine (mirrors the M365Client factory).
 *
 * Processing turns collected bytes (email bodies + attachments) into review-
 * searchable text. AEGIS supports (or will support) three engines behind one
 * interface, selected per organisation:
 *
 *   - NativeJsEngine   — in-process extraction (text/html/pdf/docx today; xlsx/
 *                        pptx as they land). Zero infra; the default + fallback.
 *   - TikaEngine       — Apache Tika Server (+ Tesseract OCR) over HTTP for
 *                        broad-format extraction. (PROC-3/4 — needs a sidecar.)
 *   - PurviewEngine    — delegate to Purview Advanced Indexing where the org
 *                        has eDiscovery Premium. (PROC-7 — needs E5.)
 *
 * `getProcessingEngineForOrg` picks the engine; unbuilt/unconfigured engines
 * degrade to native so collection never breaks. Callers depend only on the
 * interface — no change when the mode switches.
 */
import { extractAttachmentText, htmlToText } from "./text-extract";

export interface ProcessingExtractInput {
  filename?: string | null;
  contentType?: string | null;
  /** Base64 attachment bytes. */
  contentBytesB64?: string | null;
}

export interface ProcessingException {
  code: "UNSUPPORTED" | "ENCRYPTED" | "CORRUPT" | "TOO_LARGE" | "EMPTY";
  reason: string;
}

export interface ProcessingResult {
  text: string | null;
  /** Set when text could not be extracted for a determinable reason (PROC-8). */
  exception: ProcessingException | null;
}

export interface ProcessingEngine {
  readonly name: string;
  /** Email HTML body → plain text. */
  bodyToText(html: string | null | undefined, contentType?: string | null): string | null;
  /** Attachment/file bytes → text (+ an exception when it can't be read). */
  extract(input: ProcessingExtractInput): Promise<ProcessingResult>;
}

/** In-process extraction over `text-extract` — the default engine + fallback. */
export class NativeJsEngine implements ProcessingEngine {
  readonly name = "native-js";

  bodyToText(html: string | null | undefined, contentType?: string | null): string | null {
    if (html == null) return null;
    const isHtml = (contentType ?? "").toLowerCase().includes("html") || /<[a-z][\s\S]*>/i.test(html);
    return isHtml ? htmlToText(html) : (html.trim() || null);
  }

  async extract(input: ProcessingExtractInput): Promise<ProcessingResult> {
    if (!input.contentBytesB64) return { text: null, exception: { code: "EMPTY", reason: "No attachment bytes." } };
    const text = await extractAttachmentText(input.contentType, input.contentBytesB64);
    if (text) return { text, exception: null };
    // No text — classify why (best-effort) so the processing report is useful.
    const ct = (input.contentType ?? "").toLowerCase();
    const name = (input.filename ?? "").toLowerCase();
    let head = "";
    try { head = Buffer.from(input.contentBytesB64, "base64").subarray(0, 4096).toString("latin1"); } catch { /* ignore */ }
    // Encryption markers: PDF /Encrypt trailer, or OOXML "EncryptedPackage" stream.
    if (head.includes("/Encrypt") || head.includes("EncryptedPackage") || head.includes("Encrypted")) {
      return { text: null, exception: { code: "ENCRYPTED", reason: "Password-protected / encrypted — cannot extract." } };
    }
    const isImage = ct.startsWith("image/") || /\.(png|jpe?g|tiff?|gif|bmp)$/.test(name);
    if (isImage) return { text: null, exception: { code: "UNSUPPORTED", reason: "Image/scanned content — needs OCR (PROC-4)." } };
    return { text: null, exception: { code: "UNSUPPORTED", reason: `No native extractor for ${input.contentType || name || "this type"}.` } };
  }
}

/** Tally processing exceptions by code — the input to a processing report. */
export function summarizeExceptions(exceptions: Array<ProcessingException | null | undefined>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of exceptions) if (e) out[e.code] = (out[e.code] ?? 0) + 1;
  return out;
}

const NATIVE = new NativeJsEngine();

/**
 * Select the processing engine for an organisation. Native today; the Tika and
 * Purview engines slot in here (PROC-3/4/7) — until built/configured they
 * degrade to native so nothing breaks.
 */
export async function getProcessingEngineForOrg(_organizationId?: string): Promise<ProcessingEngine> {
  // TikaEngine (PROC-3): use when a Tika Server is configured.
  if (process.env.TIKA_SERVER_URL) {
    // TODO(PROC-3): return new TikaEngine(process.env.TIKA_SERVER_URL) once built.
    // Falls through to native until then.
  }
  // PurviewEngine (PROC-7): use when the org has eDiscovery Premium + opted in.
  // TODO(PROC-7): return new PurviewEngine(...) once built.
  return NATIVE;
}

/** The always-available native engine (for callers that don't need the factory). */
export function nativeProcessingEngine(): ProcessingEngine {
  return NATIVE;
}
