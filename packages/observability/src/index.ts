/**
 * @aegis/observability — structured logs, request timing, error capture
 * (W4-5, issue #122).
 *
 * One idea: every operational event is ONE JSON line on stdout/stderr.
 * Vercel (and any log drain) indexes JSON lines natively, so structured
 * search ("all slow-request events for /api/intake/storage") works with
 * zero vendor code. The Sentry seam is `captureError` — when an
 * error-tracking vendor is adopted, its SDK call goes inside that one
 * function and every call site is already wired.
 *
 * Tunables (env):
 *   AEGIS_SLOW_REQUEST_MS  request-duration warn threshold (default 2000)
 *   AEGIS_SLOW_QUERY_MS    Prisma query warn threshold    (default 500)
 */

export type LogLevel = "info" | "warn" | "error";

/** Keys whose values are never logged (defense in depth — callers
 *  shouldn't pass secrets at all). */
const REDACT_KEYS = /pass(word)?|secret|token|authorization|cookie|apikey|api_key/i;

export function redactFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = REDACT_KEYS.test(k) ? "[redacted]" : v;
  }
  return out;
}

/** One structured JSON line. `kind` is the queryable event name
 *  (dot.notation, e.g. "request", "slow-query", "client-error"). */
export function logEvent(
  level: LogLevel,
  kind: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    kind,
    ...redactFields(fields),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function slowRequestThresholdMs(): number {
  const raw = Number(process.env.AEGIS_SLOW_REQUEST_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 2000;
}

export function slowQueryThresholdMs(): number {
  const raw = Number(process.env.AEGIS_SLOW_QUERY_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 500;
}

/**
 * THE Sentry seam. Today: one structured error line (name, message,
 * clipped stack, context). Adopting a vendor later means adding its
 * SDK call HERE — every call site is already routed through.
 */
export function captureError(
  err: unknown,
  context: Record<string, unknown> = {},
): void {
  const e = err instanceof Error ? err : new Error(String(err));
  logEvent("error", "exception", {
    errorName: e.name,
    message: e.message,
    stack: (e.stack ?? "").split("\n").slice(0, 8).join("\n"),
    ...context,
  });
}

// ── Request logging wrapper ──────────────────────────────────────────

/** Framework-agnostic shapes (structurally match Next's req/res). */
export interface LoggableRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
}
export interface LoggableResponse {
  statusCode: number;
  headersSent: boolean;
  status: (code: number) => { json: (body: unknown) => unknown };
  on?: (event: string, cb: () => void) => void;
}

function requestId(req: LoggableRequest): string {
  const h = req.headers["x-vercel-id"] ?? req.headers["x-request-id"];
  const v = Array.isArray(h) ? h[0] : h;
  return v || Math.random().toString(36).slice(2, 10);
}

/** Strip query strings (may carry tokens) — log the path only. */
function pathOnly(url: string | undefined): string {
  if (!url) return "";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

/**
 * Wrap a Next API handler: one structured `request` line per call
 * (method, path, status, ms, requestId), a `slow-request` warn past
 * the threshold, and a last-resort catch that logs the exception and
 * returns a clean 500 instead of a platform crash page.
 */
export function withRequestLog<
  Req extends LoggableRequest,
  Res extends LoggableResponse,
>(
  handler: (req: Req, res: Res) => unknown | Promise<unknown>,
  name?: string,
): (req: Req, res: Res) => Promise<void> {
  return async (req, res) => {
    const started = Date.now();
    const id = requestId(req);
    const path = name ?? pathOnly(req.url);
    try {
      await handler(req, res);
    } catch (err) {
      captureError(err, { route: path, requestId: id });
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: "Internal error" });
      }
    } finally {
      const ms = Date.now() - started;
      const slow = ms >= slowRequestThresholdMs();
      logEvent(slow ? "warn" : "info", slow ? "slow-request" : "request", {
        method: req.method,
        route: path,
        status: res.statusCode,
        ms,
        requestId: id,
      });
    }
  };
}

// ── Client error ingestion (browser → server) ────────────────────────

export interface ClientErrorReport {
  message: string;
  stack: string | null;
  source: string;
  url: string;
}

const CLIP = { message: 500, stack: 2000, source: 80, url: 300 } as const;

/** Validate + clamp an untrusted browser error payload. Returns null
 *  for garbage so the endpoint can 400 without throwing. */
export function sanitizeClientError(body: unknown): ClientErrorReport | null {
  const o = (body ?? {}) as Record<string, unknown>;
  const message = typeof o.message === "string" ? o.message.trim() : "";
  if (!message) return null;
  const str = (v: unknown, max: number) =>
    typeof v === "string" ? v.slice(0, max) : null;
  return {
    message: message.slice(0, CLIP.message),
    stack: str(o.stack, CLIP.stack),
    source: str(o.source, CLIP.source) ?? "window",
    url: str(o.url, CLIP.url) ?? "",
  };
}
