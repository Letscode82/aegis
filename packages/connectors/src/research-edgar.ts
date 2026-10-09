/**
 * SEC EDGAR provider (C-4) — U.S. securities filings.
 *
 * Queries EDGAR full-text search (`efts.sec.gov`). No credential; the SEC
 * requires only a descriptive `User-Agent` identifying the operator, which the
 * caller supplies via `ctx.userAgent`. Each hit links to the filing on
 * `sec.gov`.
 *
 * Docs: https://www.sec.gov/edgar/sec-api-documentation
 */
import type { LegalAuthority, ResearchProvider, ResearchProviderContext, ResearchQuery } from "./research-types.js";
import { arr, asRecord, cap, firstStr, isoDate, qs, snippet, str } from "./research-shared.js";

const SEARCH = "https://efts.sec.gov/LATEST/search-index";

export const edgarProvider: ResearchProvider = {
  id: "edgar",
  label: "SEC EDGAR",
  type: "filing",
  jurisdictions: ["US", "US-FED"],
  requiresCredential: false,

  async search(query: ResearchQuery, ctx: ResearchProviderContext): Promise<LegalAuthority[]> {
    const limit = cap(query);
    const url = `${SEARCH}?${qs({ q: query.query })}`;
    const res = await ctx.http(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        // SEC fair-access policy requires an identifying UA; fall back to a generic one.
        "User-Agent": ctx.userAgent || "OneLegal Legal Operations research@aegis.example",
      },
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`EDGAR returned ${res.status}`);
    }
    const body = asRecord(await res.json());
    const hits = arr(asRecord(body.hits).hits).slice(0, limit);

    return hits.flatMap((raw): LegalAuthority[] => {
      const hit = asRecord(raw);
      const src = asRecord(hit.source ?? hit._source);
      const names = arr(src.display_names).map((n) => str(n)).filter((n): n is string => !!n);
      const form = str(src.form ?? src.file_type);
      const title = names[0] ? `${names[0]}${form ? ` — ${form}` : ""}` : firstStr(form, str(hit._id));
      if (!title) return [];
      const id = str(hit._id) || title;
      // EDGAR FTS ids look like "<accession>:<file>"; the accession (dashed) is the filing index.
      const accession = (id.split(":")[0] || "").replace(/-/g, "");
      const cik = str(arr(src.ciks)[0]);
      const url2 =
        accession && cik
          ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${form || ""}`
          : "https://www.sec.gov/cgi-bin/srqsb";
      return [
        {
          id,
          provider: "edgar",
          providerLabel: "SEC EDGAR",
          type: "filing",
          title,
          citation: form ? `SEC Form ${form}` : undefined,
          authority: "U.S. Securities and Exchange Commission",
          jurisdiction: "US-FED",
          date: isoDate(firstStr(src.file_date, src.filed)),
          url: url2,
          snippet: snippet(names.join(", ") || title),
        },
      ];
    });
  },
};
