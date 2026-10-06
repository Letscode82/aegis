/**
 * USPTO trademark client. Targets the USPTO open-data trademark search
 * endpoint (JSON) with an API key (developer.uspto.gov). The exact search
 * path is config-driven because USPTO's public full-text search surface has
 * been in transition since TESS was retired (2023) — set USPTO_SEARCH_URL
 * to the tenant's provisioned search endpoint; the request/response mapping
 * below follows the documented trademark-record shape.
 *
 * Auth: header `USPTO-API-KEY: <key>`.
 */
import { type TrademarkRegistryClient, type RegistryMark, type HttpFetch, DEFAULT_HTTP, normalizeStatus, coerceClasses } from "./types";

export interface UsptoConfig {
  apiKey: string;
  /** Search endpoint returning trademark records as JSON. */
  searchUrl: string;
}

export class UsptoClient implements TrademarkRegistryClient {
  readonly source = "USPTO";
  constructor(private cfg: UsptoConfig, private http: HttpFetch = DEFAULT_HTTP) {}

  async searchMarks(term: string, classes: number[]): Promise<RegistryMark[]> {
    const url = new URL(this.cfg.searchUrl);
    url.searchParams.set("query", term);
    if (classes.length) url.searchParams.set("internationalClass", classes.join(","));
    url.searchParams.set("rows", "40");
    const resp = await this.http(url.toString(), {
      method: "GET",
      headers: { "USPTO-API-KEY": this.cfg.apiKey, Accept: "application/json" },
    });
    if (!resp.ok) throw new Error(`USPTO search ${resp.status}`);
    const body = (await resp.json()) as Record<string, unknown>;
    return mapUspto(body);
  }
}

/** Map the USPTO JSON response → RegistryMark[]. Defensive across the
 *  documented field variants (results/trademarks/response.docs). */
export function mapUspto(body: Record<string, unknown>): RegistryMark[] {
  const rows =
    (Array.isArray((body as { trademarks?: unknown[] }).trademarks) && (body as { trademarks: unknown[] }).trademarks) ||
    (Array.isArray((body as { results?: unknown[] }).results) && (body as { results: unknown[] }).results) ||
    (Array.isArray(((body as { response?: { docs?: unknown[] } }).response || {}).docs) && (body as { response: { docs: unknown[] } }).response.docs) ||
    [];
  const out: RegistryMark[] = [];
  for (const r of rows as Array<Record<string, unknown>>) {
    const wordMark = String(r.markElement || r.wordMark || r.mark || r.searchText || "").trim();
    if (!wordMark) continue;
    const ref = String(r.serialNumber || r.registrationNumber || r.id || wordMark);
    out.push({
      source: "USPTO",
      ref,
      wordMark,
      classes: coerceClasses(r.internationalClass ?? r.classifications ?? r.classCodes),
      status: normalizeStatus(r.status ?? r.markCurrentStatusExternalDescriptionText ?? r.liveDeadIndicator),
      owner: (r.ownerName as string) || (r.owner as string) || null,
      registeredAt: (r.registrationDate as string) || null,
    });
  }
  return out;
}
