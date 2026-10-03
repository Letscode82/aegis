/**
 * CourtListener provider (C-4) — US caselaw.
 *
 * Queries the Free Law Project's CourtListener v4 search API for judicial
 * opinions. Works anonymously; a stored API token (`Authorization: Token …`)
 * only raises rate limits, so the provider is zero-config by default.
 *
 * Docs: https://www.courtlistener.com/help/api/rest/search/
 */
import type { LegalAuthority, ResearchProvider, ResearchProviderContext, ResearchQuery } from "./research-types.js";
import { arr, asRecord, cap, firstStr, isoDate, qs, snippet, str } from "./research-shared.js";

const BASE = "https://www.courtlistener.com";

export const courtListenerProvider: ResearchProvider = {
  id: "courtlistener",
  label: "CourtListener",
  type: "caselaw",
  jurisdictions: ["US", "US-FED"],
  requiresCredential: false,

  async search(query: ResearchQuery, ctx: ResearchProviderContext): Promise<LegalAuthority[]> {
    const limit = cap(query);
    const url = `${BASE}/api/rest/v4/search/?${qs({ q: query.query, type: "o", order_by: "score desc" })}`;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (ctx.apiKey) headers.Authorization = `Token ${ctx.apiKey}`;

    const res = await ctx.http(url, { method: "GET", headers });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`CourtListener returned ${res.status}`);
    }
    const body = asRecord(await res.json());
    const results = arr(body.results).slice(0, limit);

    return results.flatMap((raw): LegalAuthority[] => {
      const r = asRecord(raw);
      const title = firstStr(r.caseName, r.caseNameFull);
      if (!title) return [];
      const citations = arr(r.citation).map((c) => str(c)).filter((c): c is string => !!c);
      const absolute = str(r.absolute_url);
      const id = str(r.cluster_id) || str(r.id) || absolute || title;
      return [
        {
          id,
          provider: "courtlistener",
          providerLabel: "CourtListener",
          type: "caselaw",
          title,
          citation: citations[0],
          authority: firstStr(r.court, r.court_id),
          jurisdiction: "US",
          date: isoDate(r.dateFiled),
          url: absolute ? `${BASE}${absolute}` : undefined,
          snippet: snippet(firstStr(r.snippet, r.text, citations.join(", "), title)),
        },
      ];
    });
  },
};
