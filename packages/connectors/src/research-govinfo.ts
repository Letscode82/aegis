/**
 * GovInfo provider (C-4) — US statutes, the CFR, and public laws.
 *
 * Queries the U.S. GPO's GovInfo search API (POST /search). A `DEMO_KEY`
 * fallback keeps the demo zero-config; an org-stored key raises the quota.
 * Results are tagged `statute` for US Code / Statutes at Large and `regulation`
 * for the CFR / Federal Register, so the UI badges them correctly.
 *
 * Docs: https://api.govinfo.gov/docs/
 */
import type { LegalAuthority, ResearchProvider, ResearchProviderContext, ResearchQuery } from "./research-types.js";
import { arr, asRecord, cap, firstStr, isoDate, snippet, str } from "./research-shared.js";

const SEARCH = "https://api.govinfo.gov/search";

/** Map a GovInfo collection code to our authority type. */
function typeForCollection(code: string | undefined): LegalAuthority["type"] {
  switch ((code || "").toUpperCase()) {
    case "CFR":
    case "FR":
    case "ECFR":
      return "regulation";
    case "USCODE":
    case "STATUTE":
    case "PLAW":
    case "BILLS":
      return "statute";
    default:
      return "statute";
  }
}

export const govInfoProvider: ResearchProvider = {
  id: "govinfo",
  label: "GovInfo (GPO)",
  type: "statute",
  jurisdictions: ["US", "US-FED"],
  requiresCredential: false,

  async search(query: ResearchQuery, ctx: ResearchProviderContext): Promise<LegalAuthority[]> {
    const limit = cap(query);
    const apiKey = ctx.apiKey || "DEMO_KEY";
    const url = `${SEARCH}?api_key=${encodeURIComponent(apiKey)}`;
    const payload = {
      query: query.query,
      pageSize: limit,
      offsetMark: "*",
      sorts: [{ field: "relevancy", sortOrder: "DESC" }],
    };

    const res = await ctx.http(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`GovInfo returned ${res.status}`);
    }
    const body = asRecord(await res.json());
    const results = arr(body.results).slice(0, limit);

    return results.flatMap((raw): LegalAuthority[] => {
      const r = asRecord(raw);
      const title = firstStr(r.title, r.resultTitle);
      if (!title) return [];
      const collection = str(r.collectionCode);
      const id = firstStr(r.packageId, r.granuleId) || title;
      return [
        {
          id,
          provider: "govinfo",
          providerLabel: "GovInfo (GPO)",
          type: typeForCollection(collection),
          title,
          citation: firstStr(r.citation, collection),
          authority: firstStr(r.governmentAuthor, r.publisher) || "U.S. Government Publishing Office",
          jurisdiction: "US-FED",
          date: isoDate(firstStr(r.dateIssued, r.lastModified)),
          url: firstStr(r.resultLink, r.detailsLink, r.download && asRecord(r.download).pdfLink),
          snippet: snippet(firstStr(r.summary, r.title)),
        },
      ];
    });
  },
};
