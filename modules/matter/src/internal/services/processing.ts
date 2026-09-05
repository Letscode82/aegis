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

export type ProcessingMode = "native" | "tika" | "purview";
/** The configured intent — `auto` picks the best available (Tika if a sidecar is set, else native). */
export type ConfiguredProcessingMode = ProcessingMode | "auto";

/**
 * Read the org/deployment's configured processing mode from
 * `AEGIS_PROCESSING_MODE` (PROC-7). `auto` (the default) picks Tika when a
 * sidecar is configured, else native. `purview` is opt-in only — never auto-
 * selected — and engages only when the org's delegated eDiscovery account is
 * connected (see `getProcessingEngineForOrg`).
 *
 * This is a per-deployment env switch today; a per-org column is the multi-
 * tenant follow-up (PROC-7, deferred migration).
 */
export function resolveConfiguredMode(): ConfiguredProcessingMode {
  const v = (process.env.AEGIS_PROCESSING_MODE ?? "").trim().toLowerCase();
  if (v === "native" || v === "tika" || v === "purview") return v;
  return "auto";
}

/** The base byte-extractor: Tika when a sidecar is configured, else native. */
async function baseEngine(): Promise<ProcessingEngine> {
  const tikaUrl = process.env.TIKA_SERVER_URL;
  if (tikaUrl) {
    const { getTikaEngine } = await import("./tika-engine");
    return getTikaEngine(tikaUrl);
  }
  return NATIVE;
}

/**
 * Select the processing engine for an organisation (PROC-1/3/4/7).
 *
 * - `native` → in-process extraction.
 * - `tika` / `auto` → Tika sidecar when configured, else native. Tika degrades
 *   to native on any transport failure, so a down sidecar never stalls.
 * - `purview` → Purview mode, but ONLY when the org's delegated eDiscovery
 *   service account is connected; otherwise falls back to the base engine so
 *   collection never stalls. (Purview processes bytes asynchronously inside
 *   review sets, so the engine delegates direct-byte extraction to the base
 *   engine — the review-set read-back is PROC-7b, gated on a live E5 tenant.)
 */
export async function getProcessingEngineForOrg(organizationId?: string): Promise<ProcessingEngine> {
  const mode = resolveConfiguredMode();
  if (mode === "native") return NATIVE;
  if (mode === "purview") {
    const { PurviewProcessingEngine, getPurviewProcessingStatus } = await import("./purview-engine");
    const status = await getPurviewProcessingStatus(organizationId);
    if (status.connected) return new PurviewProcessingEngine(await baseEngine());
    return baseEngine(); // selected purview but not connected/licensed — degrade
  }
  // tika | auto
  return baseEngine();
}

/** The always-available native engine (for callers that don't need the factory). */
export function nativeProcessingEngine(): ProcessingEngine {
  return NATIVE;
}

export interface ProcessingStatus {
  /** The configured intent (`AEGIS_PROCESSING_MODE`). */
  configuredMode: ConfiguredProcessingMode;
  /** The engine actually selected right now (after fallback). */
  mode: ProcessingMode;
  engine: string;
  /** Present when a Tika sidecar is configured — a shallow /version probe. */
  tika?: {
    url: string;
    reachable: boolean;
    version: string | null;
    error: string | null;
  };
  /** Present when configured mode is `purview` — the eDiscovery connection gate. */
  purview?: {
    connected: boolean;
    accountUpn: string | null;
    expired: boolean;
    reason: string | null;
  };
}

/**
 * Health/status for the processing pipeline — configured intent, the engine
 * actually selected (after fallback), a bounded Tika `/version` probe, and for
 * `purview` the eDiscovery connection gate. Mirrors `getM365ConnectionStatus`;
 * processes no document.
 */
export async function getProcessingStatusForOrg(organizationId?: string): Promise<ProcessingStatus> {
  const configuredMode = resolveConfiguredMode();
  const tikaUrl = process.env.TIKA_SERVER_URL;

  let tika: ProcessingStatus["tika"];
  if (tikaUrl) {
    const { tikaVersion } = await import("./tika-engine");
    let reachable = false;
    let version: string | null = null;
    let error: string | null = null;
    try {
      version = await tikaVersion(tikaUrl);
      reachable = true;
    } catch (e) {
      error = (e as Error)?.name === "AbortError"
        ? "timeout — the Tika sidecar did not respond in time (it may be asleep; retry)"
        : String((e as Error)?.message ?? e);
    }
    tika = { url: tikaUrl, reachable, version, error };
  }

  let purview: ProcessingStatus["purview"];
  let mode: ProcessingMode;
  if (configuredMode === "purview") {
    const { getPurviewProcessingStatus } = await import("./purview-engine");
    const ps = await getPurviewProcessingStatus(organizationId);
    purview = ps;
    mode = ps.connected ? "purview" : (tikaUrl ? "tika" : "native");
  } else if (configuredMode === "native") {
    mode = "native";
  } else {
    // tika | auto
    mode = tikaUrl ? "tika" : "native";
  }

  return { configuredMode, mode, engine: mode === "native" ? NATIVE.name : mode, tika, purview };
}
