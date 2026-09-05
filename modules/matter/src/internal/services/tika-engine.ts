/**
 * PROC-3 / PROC-4 — Apache Tika Server processing engine.
 *
 * One HTTP sidecar (`apache/tika:latest-full`) gives broad-format text +
 * metadata extraction for ~1000 file types AND Tesseract OCR for scanned
 * images / image-only PDFs — the credible path to "you can turn Purview
 * processing off". This engine speaks to Tika's `/rmeta/text` endpoint, which
 * returns one JSON record per document (and per embedded document, so ZIP /
 * container families expand for free), each carrying `X-TIKA:content`.
 *
 * Degradation is the load-bearing property: a Tika outage, timeout or network
 * error must never stall collection, so every transport failure falls back to
 * the in-process `NativeJsEngine`. Only genuine extraction outcomes
 * (encrypted / unsupported / corrupt) are surfaced as typed exceptions.
 *
 * The engine is gated entirely behind `TIKA_SERVER_URL` in
 * `getProcessingEngineForOrg` — with no server configured, nothing here runs
 * and native stays the default. `fetchImpl` is injectable so the mapping logic
 * is unit-tested without a live server.
 */
import {
  NativeJsEngine,
  type ProcessingEngine,
  type ProcessingExtractInput,
  type ProcessingResult,
  type ProcessingException,
} from "./processing";

type FetchImpl = typeof fetch;

export interface TikaEngineOptions {
  /** Injected for tests; defaults to the global `fetch`. */
  fetchImpl?: FetchImpl;
  /** Fallback used on any transport failure; defaults to a NativeJsEngine. */
  fallback?: ProcessingEngine;
  /** Per-request timeout (ms). OCR can be slow — default 120s. */
  timeoutMs?: number;
}

/** One record in Tika's `/rmeta/text` JSON array. */
type TikaRecord = Record<string, unknown> & { "X-TIKA:content"?: string };

const ENCRYPT_RE = /encrypt|password[- ]?protect|password required/i;

export class TikaEngine implements ProcessingEngine {
  readonly name = "tika";
  private readonly base: string;
  private readonly fetchImpl: FetchImpl;
  private readonly fallback: ProcessingEngine;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, opts: TikaEngineOptions = {}) {
    this.base = baseUrl.replace(/\/+$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.fallback = opts.fallback ?? new NativeJsEngine();
    this.timeoutMs =
      opts.timeoutMs ??
      (Number.parseInt(process.env.TIKA_TIMEOUT_MS ?? "", 10) || 120_000);
  }

  /** Email bodies are cheap to handle in-process — reuse the native path. */
  bodyToText(html: string | null | undefined, contentType?: string | null): string | null {
    return this.fallback.bodyToText(html, contentType);
  }

  async extract(input: ProcessingExtractInput): Promise<ProcessingResult> {
    if (!input.contentBytesB64) return { text: null, exception: { code: "EMPTY", reason: "No attachment bytes." } };

    let bytes: Buffer;
    try {
      bytes = Buffer.from(input.contentBytesB64, "base64");
    } catch {
      return { text: null, exception: { code: "CORRUPT", reason: "Attachment bytes are not valid base64." } };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/rmeta/text`, {
        method: "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": input.contentType || "application/octet-stream",
        },
        body: bytes,
        signal: controller.signal,
      });
    } catch {
      // Transport failure (network / abort / DNS) — degrade, never stall.
      clearTimeout(timer);
      return this.fallback.extract(input);
    } finally {
      clearTimeout(timer);
    }

    // 5xx is a server-side failure, not a document verdict — degrade to native.
    if (res.status >= 500) return this.fallback.extract(input);

    if (res.status === 415) {
      return { text: null, exception: { code: "UNSUPPORTED", reason: "Tika: unsupported media type." } };
    }
    if (res.status === 413) {
      return { text: null, exception: { code: "TOO_LARGE", reason: "Tika: document exceeds server size limit." } };
    }
    if (res.status === 422 || (res.status >= 400 && res.status < 500)) {
      const body = await safeText(res);
      const code: ProcessingException["code"] = ENCRYPT_RE.test(body) ? "ENCRYPTED" : "CORRUPT";
      return {
        text: null,
        exception: {
          code,
          reason:
            code === "ENCRYPTED"
              ? "Password-protected / encrypted — Tika could not decrypt."
              : `Tika could not parse the document (HTTP ${res.status}).`,
        },
      };
    }

    // 2xx — parse the rmeta JSON and pull the text out of every record.
    const raw = await safeText(res);
    let records: TikaRecord[];
    try {
      const parsed = JSON.parse(raw);
      records = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // Not JSON — treat the raw body as plain extracted text.
      const t = raw.trim();
      return t ? { text: t, exception: null } : { text: null, exception: { code: "EMPTY", reason: "Tika returned no content." } };
    }

    const text = records
      .map((r) => (typeof r["X-TIKA:content"] === "string" ? (r["X-TIKA:content"] as string) : ""))
      .join("\n\n")
      .trim();

    if (text) return { text, exception: null };

    // No text — inspect Tika's exception metadata to classify why.
    const encrypted = records.some(recordSignalsEncryption);
    if (encrypted) {
      return { text: null, exception: { code: "ENCRYPTED", reason: "Password-protected / encrypted — Tika could not decrypt." } };
    }
    const hadException = records.some(recordHasException);
    if (hadException) {
      return { text: null, exception: { code: "CORRUPT", reason: "Tika raised a parse exception with no recoverable text." } };
    }
    return { text: null, exception: { code: "EMPTY", reason: "No extractable text (blank document or image with no OCR text)." } };
  }
}

/**
 * GET /version — a shallow health probe (no document processing). Bounded by
 * `timeoutMs` (default 10s) so a sleeping / slow-to-wake sidecar surfaces as a
 * timeout rather than hanging the caller.
 */
export async function tikaVersion(baseUrl: string, fetchImpl: FetchImpl = fetch, timeoutMs = 10_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/version`, { method: "GET", signal: controller.signal });
    if (!res.ok) throw new Error(`Tika /version returned HTTP ${res.status}`);
    return (await res.text()).trim();
  } finally {
    clearTimeout(timer);
  }
}

// ---- per-org engine cache (mirror the M365 client cache) ----
const tikaCache = new Map<string, TikaEngine>();
export function getTikaEngine(baseUrl: string): TikaEngine {
  let eng = tikaCache.get(baseUrl);
  if (!eng) {
    eng = new TikaEngine(baseUrl);
    tikaCache.set(baseUrl, eng);
  }
  return eng;
}

function recordHasException(r: TikaRecord): boolean {
  return Object.keys(r).some((k) => k.startsWith("X-TIKA:EXCEPTION"));
}
function recordSignalsEncryption(r: TikaRecord): boolean {
  for (const [k, v] of Object.entries(r)) {
    if (!k.startsWith("X-TIKA:EXCEPTION") && k !== "X-TIKA:Parsed-By") continue;
    if (typeof v === "string" && ENCRYPT_RE.test(v)) return true;
  }
  return false;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
