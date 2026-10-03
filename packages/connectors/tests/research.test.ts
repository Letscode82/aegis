import { describe, it, expect } from "vitest";
import {
  runResearch,
  selectProviders,
  defaultResearchProviders,
  courtListenerProvider,
  govInfoProvider,
  edgarProvider,
  eurLexProvider,
  buildSparql,
} from "../src/research.js";
import type { ResearchHttp, ResearchProvider } from "../src/research.js";

/** Build a one-shot HTTP stub that returns a fixed JSON body with status 200. */
function httpJson(body: unknown, status = 200): { http: ResearchHttp; calls: Array<{ url: string; init: unknown }> } {
  const calls: Array<{ url: string; init: unknown }> = [];
  const http: ResearchHttp = async (url, init) => {
    calls.push({ url, init });
    return {
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  return { http, calls };
}

describe("CourtListener provider", () => {
  it("normalizes v4 opinion results and sends the token header when keyed", async () => {
    const { http, calls } = httpJson({
      results: [
        {
          cluster_id: 42,
          caseName: "Roe v. Wade",
          citation: ["410 U.S. 113"],
          court: "Supreme Court",
          dateFiled: "1973-01-22",
          absolute_url: "/opinion/108713/roe-v-wade/",
          snippet: "the Court held ...",
        },
      ],
    });
    const out = await courtListenerProvider.search({ query: "abortion" }, { http, apiKey: "tok123" });
    expect(out).toHaveLength(1);
    expect(out[0]!).toMatchObject({
      provider: "courtlistener",
      type: "caselaw",
      title: "Roe v. Wade",
      citation: "410 U.S. 113",
      jurisdiction: "US",
      date: "1973-01-22",
      url: "https://www.courtlistener.com/opinion/108713/roe-v-wade/",
    });
    expect((calls[0]!.init as { headers: Record<string, string> }).headers.Authorization).toBe("Token tok123");
  });

  it("works anonymously (no auth header) and throws on a non-2xx", async () => {
    const { http, calls } = httpJson({ results: [] });
    await courtListenerProvider.search({ query: "x" }, { http });
    expect((calls[0]!.init as { headers: Record<string, string> }).headers.Authorization).toBeUndefined();

    const bad = httpJson({}, 503);
    await expect(courtListenerProvider.search({ query: "x" }, { http: bad.http })).rejects.toThrow(/503/);
  });
});

describe("GovInfo provider", () => {
  it("POSTs with DEMO_KEY by default and maps CFR to a regulation", async () => {
    const { http, calls } = httpJson({
      results: [
        { title: "17 CFR 240.10b-5", collectionCode: "CFR", dateIssued: "2023-01-01", packageId: "CFR-2023", resultLink: "https://govinfo.example/x" },
        { title: "Securities Exchange Act", collectionCode: "USCODE", dateIssued: "1934-06-06", granuleId: "g1" },
      ],
    });
    const out = await govInfoProvider.search({ query: "10b-5" }, { http });
    expect(calls[0]!.url).toContain("api_key=DEMO_KEY");
    expect((calls[0]!.init as { method: string }).method).toBe("POST");
    expect(out[0]!.type).toBe("regulation");
    expect(out[1]!.type).toBe("statute");
    expect(out[0]!.jurisdiction).toBe("US-FED");
  });
});

describe("EDGAR provider", () => {
  it("sets a User-Agent and normalizes a full-text hit", async () => {
    const { http, calls } = httpJson({
      hits: { hits: [{ _id: "0000320193-23-000106:aapl.htm", _source: { display_names: ["Apple Inc. (AAPL)"], form: "10-K", file_date: "2023-11-03", ciks: ["0000320193"] } }] },
    });
    const out = await edgarProvider.search({ query: "risk factors" }, { http, userAgent: "AEGIS test@aegis.example" });
    expect((calls[0]!.init as { headers: Record<string, string> }).headers["User-Agent"]).toBe("AEGIS test@aegis.example");
    expect(out[0]!).toMatchObject({ provider: "edgar", type: "filing", title: "Apple Inc. (AAPL) — 10-K", citation: "SEC Form 10-K", date: "2023-11-03" });
    expect(out[0]!.url).toContain("CIK=0000320193");
  });
});

describe("EUR-Lex provider", () => {
  it("builds a CONTAINS SPARQL filter and parses bindings into CELEX authorities", async () => {
    expect(buildSparql('data "protection"', 3)).toContain('CONTAINS(LCASE(STR(?title)), LCASE("data protection"))');
    const { http, calls } = httpJson({
      results: { bindings: [{ celex: { value: "32016R0679" }, title: { value: "General Data Protection Regulation" }, date: { value: "2016-04-27" } }] },
    });
    const out = await eurLexProvider.search({ query: "data protection" }, { http });
    expect(calls[0]!.url).toContain("format=application%2Fsparql-results%2Bjson");
    expect(out[0]!).toMatchObject({ provider: "eurlex", type: "eu-law", citation: "CELEX 32016R0679", jurisdiction: "EU", date: "2016-04-27" });
    expect(out[0]!.url).toContain("CELEX:32016R0679");
  });
});

describe("selectProviders", () => {
  const ps = defaultResearchProviders();
  it("returns all when no jurisdiction is given", () => {
    expect(selectProviders(ps).length).toBe(4);
  });
  it("filters to EU for an EU query and US providers for US", () => {
    expect(selectProviders(ps, "EU").map((p) => p.id)).toEqual(["eurlex"]);
    expect(selectProviders(ps, "US").map((p) => p.id)).toEqual(["courtlistener", "govinfo", "edgar"]);
  });
  it("falls back to all providers on an unknown jurisdiction", () => {
    expect(selectProviders(ps, "MARS").length).toBe(4);
  });
});

describe("runResearch", () => {
  const ok = (id: string, n: number): ResearchProvider => ({
    id,
    label: id,
    type: "caselaw",
    jurisdictions: ["US"],
    requiresCredential: false,
    async search() {
      return Array.from({ length: n }, (_, i) => ({
        id: `${id}-${i}`,
        provider: id,
        providerLabel: id,
        type: "caselaw" as const,
        title: `${id} authority ${i}`,
        snippet: "s",
      }));
    },
  });

  it("numbers authorities 1-based across providers and reports per-provider counts", async () => {
    const res = await runResearch({
      providers: [ok("a", 2), ok("b", 1)],
      query: { query: "q" },
      contextFor: () => ({ http: httpJson({}).http }),
    });
    expect(res.authorities.map((a) => a.n)).toEqual([1, 2, 3]);
    expect(res.providers).toEqual([
      { id: "a", label: "a", ok: true, count: 2 },
      { id: "b", label: "b", ok: true, count: 1 },
    ]);
  });

  it("isolates a failing provider and still returns the others", async () => {
    const boom: ResearchProvider = {
      id: "boom",
      label: "boom",
      type: "filing",
      jurisdictions: ["US"],
      requiresCredential: false,
      async search() {
        throw new Error("upstream 500");
      },
    };
    const res = await runResearch({
      providers: [boom, ok("a", 1)],
      query: { query: "q" },
      contextFor: () => ({ http: httpJson({}).http }),
    });
    expect(res.authorities).toHaveLength(1);
    expect(res.providers.find((p) => p.id === "boom")).toMatchObject({ ok: false, count: 0, error: "upstream 500" });
  });

  it("dedupes repeated (provider,id) authorities", async () => {
    const dup: ResearchProvider = {
      id: "dup",
      label: "dup",
      type: "caselaw",
      jurisdictions: ["US"],
      requiresCredential: false,
      async search() {
        const one = { id: "same", provider: "dup", providerLabel: "dup", type: "caselaw" as const, title: "t", snippet: "s" };
        return [one, { ...one }];
      },
    };
    const res = await runResearch({ providers: [dup], query: { query: "q" }, contextFor: () => ({ http: httpJson({}).http }) });
    expect(res.authorities).toHaveLength(1);
  });
});
