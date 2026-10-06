/**
 * Trademark registry client contract. Each registry (USPTO / EUIPO / WIPO)
 * implements searchMarks(term, classes) and maps its native response into a
 * common RegistryMark, which the screen upserts into TrademarkMark and runs
 * the deterministic similarity over.
 *
 * The HTTP call is INJECTABLE (HttpFetch) so the mappers + flow are unit-
 * tested without hitting the live registries, and so the production
 * transport (with the org's outbound proxy) is a swap. Real credentials +
 * outbound access to the registry hosts are required to exercise the live
 * calls — see docs/trademark-registries.md.
 */

export interface RegistryMark {
  /** "USPTO" | "EUIPO" | "WIPO" */
  source: string;
  /** Stable id within the source (serial / application / registration no.). */
  ref: string;
  wordMark: string;
  /** NICE class numbers (1–45). */
  classes: number[];
  /** "LIVE" | "DEAD" | "PENDING" — normalized from the registry's status. */
  status: string;
  owner?: string | null;
  registeredAt?: string | null;
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}
export type HttpFetch = (url: string, init?: Record<string, unknown>) => Promise<HttpResponse>;

export interface TrademarkRegistryClient {
  readonly source: string;
  /** Search the registry for marks similar to `term` (optionally in `classes`). */
  searchMarks(term: string, classes: number[]): Promise<RegistryMark[]>;
}

/** Normalize a registry's status string to LIVE / DEAD / PENDING. */
export function normalizeStatus(raw: unknown): string {
  const s = String(raw || "").toLowerCase();
  if (/dead|abandon|cancel|expired|withdrawn|refused/.test(s)) return "DEAD";
  if (/pending|filed|examination|opposition|published/.test(s)) return "PENDING";
  if (/live|registered|active/.test(s)) return "LIVE";
  return "LIVE"; // conservative: treat unknown as live (a conflict we should surface)
}

/** Coerce a registry's class field (array | csv | numbers) into number[]. */
export function coerceClasses(v: unknown): number[] {
  const out = new Set<number>();
  const push = (x: unknown) => {
    const n = typeof x === "number" ? x : parseInt(String(x).replace(/[^0-9]/g, ""), 10);
    if (Number.isFinite(n) && n >= 1 && n <= 45) out.add(n);
  };
  if (Array.isArray(v)) v.forEach(push);
  else if (typeof v === "string") v.split(/[^0-9]+/).forEach(push);
  else if (v != null) push(v);
  return [...out];
}

export const DEFAULT_HTTP: HttpFetch = (url, init) =>
  fetch(url, init as RequestInit) as unknown as Promise<HttpResponse>;
