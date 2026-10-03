/**
 * Defensive parse helpers shared across research providers (C-4).
 *
 * External legal APIs return loosely-typed JSON whose shape drifts; a provider
 * must never throw on a missing or mistyped field (the service isolates a
 * throw, but a clean skip of a bad row keeps the good ones). These helpers read
 * through `unknown` and return typed values or `undefined`.
 */

export function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export function str(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

export function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** First non-empty string from a list of candidates. */
export function firstStr(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    const s = str(c);
    if (s) return s;
  }
  return undefined;
}

/** Normalize a date-ish value to ISO yyyy-mm-dd, or leave as-is if unparseable. */
export function isoDate(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (m) return m[1];
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

/** Collapse whitespace and trim an excerpt to a readable length. */
export function snippet(v: unknown, max = 500): string {
  const s = (str(v) || "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Build a query string from defined params. */
export function qs(params: Record<string, string | number | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, val] of Object.entries(params)) {
    if (val !== undefined && val !== "") u.set(k, String(val));
  }
  return u.toString();
}

/** Resolve the per-provider cap from the query, clamped to a sane range. */
export function cap(query: { limitPerProvider?: number }, fallback = 5): number {
  const n = query.limitPerProvider;
  if (typeof n === "number" && Number.isFinite(n)) return Math.max(1, Math.min(20, Math.floor(n)));
  return fallback;
}
