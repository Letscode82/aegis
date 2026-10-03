/**
 * EUR-Lex provider (C-4) — EU law.
 *
 * Queries the EU Publications Office's public SPARQL endpoint over the Cellar
 * metadata graph for legal resources whose title matches the keyword, returning
 * the CELEX id, title, and document date for each. No credential required.
 *
 * The SPARQL endpoint is real and public but its graph is large and its uptime
 * variable, so this provider is best-effort by design — a transport or parse
 * failure is isolated by the research service and simply drops EU results from
 * that answer rather than failing it.
 *
 * Endpoint: https://publications.europa.eu/webapi/rdf/sparql
 */
import type { LegalAuthority, ResearchProvider, ResearchProviderContext, ResearchQuery } from "./research-types.js";
import { arr, asRecord, cap, isoDate, snippet, str } from "./research-shared.js";

const ENDPOINT = "https://publications.europa.eu/webapi/rdf/sparql";

/** Escape a user keyword for safe embedding in a SPARQL string literal / regex. */
function sparqlLiteral(s: string): string {
  return s.replace(/["\\\n\r]/g, " ").replace(/\s+/g, " ").trim();
}

/** Build a title-contains query over the Cellar `cdm:` vocabulary. */
export function buildSparql(keyword: string, limit: number): string {
  const kw = sparqlLiteral(keyword);
  return [
    "PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>",
    "SELECT DISTINCT ?celex ?title ?date WHERE {",
    "  ?work cdm:resource_legal_id_celex ?celex .",
    "  ?work cdm:work_date_document ?date .",
    "  ?expr cdm:expression_belongs_to_work ?work .",
    "  ?expr cdm:expression_title ?title .",
    `  FILTER(CONTAINS(LCASE(STR(?title)), LCASE("${kw}")))`,
    "}",
    `LIMIT ${limit}`,
  ].join("\n");
}

export const eurLexProvider: ResearchProvider = {
  id: "eurlex",
  label: "EUR-Lex",
  type: "eu-law",
  jurisdictions: ["EU"],
  requiresCredential: false,

  async search(query: ResearchQuery, ctx: ResearchProviderContext): Promise<LegalAuthority[]> {
    const limit = cap(query);
    const sparql = buildSparql(query.query, limit);
    const url = `${ENDPOINT}?query=${encodeURIComponent(sparql)}&format=${encodeURIComponent("application/sparql-results+json")}`;

    const res = await ctx.http(url, { method: "GET", headers: { Accept: "application/sparql-results+json" } });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`EUR-Lex returned ${res.status}`);
    }
    const body = asRecord(await res.json());
    const bindings = arr(asRecord(body.results).bindings).slice(0, limit);

    return bindings.flatMap((raw): LegalAuthority[] => {
      const b = asRecord(raw);
      const celex = str(asRecord(b.celex).value);
      const title = str(asRecord(b.title).value);
      if (!celex || !title) return [];
      return [
        {
          id: celex,
          provider: "eurlex",
          providerLabel: "EUR-Lex",
          type: "eu-law",
          title,
          citation: `CELEX ${celex}`,
          authority: "European Union",
          jurisdiction: "EU",
          date: isoDate(str(asRecord(b.date).value)),
          url: `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${encodeURIComponent(celex)}`,
          snippet: snippet(title),
        },
      ];
    });
  },
};
