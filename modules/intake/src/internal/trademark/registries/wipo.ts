/**
 * WIPO trademark client — WIPO Global Brand Database / Madrid Monitor.
 * WIPO's programmatic access is gated (API key / IP allow-list); the search
 * URL is config-driven. Auth: `Authorization: Bearer <key>` (or an
 * `apikey` query param on some gateway variants — both supported).
 */
import { type TrademarkRegistryClient, type RegistryMark, type HttpFetch, DEFAULT_HTTP, normalizeStatus, coerceClasses } from "./types";

export interface WipoConfig {
  apiKey: string;
  searchUrl: string;
}

export class WipoClient implements TrademarkRegistryClient {
  readonly source = "WIPO";
  constructor(private cfg: WipoConfig, private http: HttpFetch = DEFAULT_HTTP) {}

  async searchMarks(term: string, classes: number[]): Promise<RegistryMark[]> {
    const url = new URL(this.cfg.searchUrl);
    url.searchParams.set("brandName", term);
    if (classes.length) url.searchParams.set("niceClass", classes.join(","));
    url.searchParams.set("rows", "40");
    const resp = await this.http(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${this.cfg.apiKey}`, Accept: "application/json" },
    });
    if (!resp.ok) throw new Error(`WIPO search ${resp.status}`);
    return mapWipo((await resp.json()) as Record<string, unknown>);
  }
}

export function mapWipo(body: Record<string, unknown>): RegistryMark[] {
  const rows =
    (Array.isArray((body as { results?: unknown[] }).results) && (body as { results: unknown[] }).results) ||
    (Array.isArray((body as { docs?: unknown[] }).docs) && (body as { docs: unknown[] }).docs) ||
    (Array.isArray((body as { brands?: unknown[] }).brands) && (body as { brands: unknown[] }).brands) ||
    [];
  const out: RegistryMark[] = [];
  for (const r of rows as Array<Record<string, unknown>>) {
    const wordMark = String(r.brandName || r.wordMark || r.mark || r.verbalElement || "").trim();
    if (!wordMark) continue;
    out.push({
      source: "WIPO",
      ref: String(r.registrationNumber || r.applicationNumber || r.id || r.st13 || wordMark),
      wordMark,
      classes: coerceClasses(r.niceClass ?? r.classes ?? r.gs),
      status: normalizeStatus(r.status ?? r.statusCode),
      owner: (r.holder as string) || (r.owner as string) || null,
      registeredAt: (r.registrationDate as string) || null,
    });
  }
  return out;
}
