/**
 * EUIPO trademark client. EUIPO's open APIs use OAuth2 client-credentials
 * (developer portal): fetch a bearer token, then call the Trademark Search
 * API. Token URL + search URL are config-driven (they differ between the
 * sandbox and production developer platforms).
 *
 * Auth: OAuth2 client_credentials → Bearer token; the search call also
 * carries an `X-IBM-Client-Id` header on the API-gateway variant.
 */
import { type TrademarkRegistryClient, type RegistryMark, type HttpFetch, DEFAULT_HTTP, normalizeStatus, coerceClasses } from "./types";

export interface EuipoConfig {
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  searchUrl: string;
}

export class EuipoClient implements TrademarkRegistryClient {
  readonly source = "EUIPO";
  private token: { value: string; exp: number } | null = null;
  constructor(private cfg: EuipoConfig, private http: HttpFetch = DEFAULT_HTTP) {}

  private async getToken(): Promise<string> {
    if (this.token && this.token.exp > Date.now() + 30_000) return this.token.value;
    const resp = await this.http(this.cfg.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString("base64"),
      },
      body: "grant_type=client_credentials&scope=uid",
    });
    if (!resp.ok) throw new Error(`EUIPO token ${resp.status}`);
    const t = (await resp.json()) as { access_token?: string; expires_in?: number };
    if (!t.access_token) throw new Error("EUIPO token missing access_token");
    this.token = { value: t.access_token, exp: Date.now() + (t.expires_in || 3600) * 1000 };
    return this.token.value;
  }

  async searchMarks(term: string, classes: number[]): Promise<RegistryMark[]> {
    const token = await this.getToken();
    const url = new URL(this.cfg.searchUrl);
    // EUIPO trademark-search RSQL-ish query on the word mark.
    url.searchParams.set("query", `wordMarkSpecification.verbalElement=="*${term}*"`);
    if (classes.length) url.searchParams.set("niceClasses", classes.join(","));
    url.searchParams.set("size", "40");
    const resp = await this.http(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, "X-IBM-Client-Id": this.cfg.clientId, Accept: "application/json" },
    });
    if (!resp.ok) throw new Error(`EUIPO search ${resp.status}`);
    return mapEuipo((await resp.json()) as Record<string, unknown>);
  }
}

export function mapEuipo(body: Record<string, unknown>): RegistryMark[] {
  const rows =
    (Array.isArray((body as { trademarks?: unknown[] }).trademarks) && (body as { trademarks: unknown[] }).trademarks) ||
    (Array.isArray((body as { content?: unknown[] }).content) && (body as { content: unknown[] }).content) ||
    [];
  const out: RegistryMark[] = [];
  for (const r of rows as Array<Record<string, unknown>>) {
    const spec = (r.wordMarkSpecification as { verbalElement?: string }) || {};
    const wordMark = String(spec.verbalElement || r.verbalElement || r.wordMark || "").trim();
    if (!wordMark) continue;
    out.push({
      source: "EUIPO",
      ref: String(r.applicationNumber || r.registrationNumber || r.id || wordMark),
      wordMark,
      classes: coerceClasses(r.niceClasses ?? r.classifications ?? r.classes),
      status: normalizeStatus(r.status ?? r.markFeature ?? r.trademarkStatus),
      owner: (r.applicantName as string) || (r.ownerName as string) || null,
      registeredAt: (r.registrationDate as string) || null,
    });
  }
  return out;
}
