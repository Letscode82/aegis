/**
 * Legal-authority research types (C-4).
 *
 * The research layer of `@aegis/connectors`: a provider-agnostic way to query
 * *external* legal authorities — caselaw (CourtListener), US statutes / CFR
 * (GovInfo), SEC filings (EDGAR), and EU law (EUR-Lex) — and get back a single
 * normalized shape AEGIS can cite. This is the roadmap's "biggest gap vs Harvey
 * & Legora": ONE Legal can already answer over the org's own documents; C-4
 * lets it answer over the law itself, with every claim traceable to a real,
 * linkable authority.
 *
 * Pure types + an injected HTTP seam — no runtime, no `fetch`, no provider SDK —
 * so every provider is unit-testable against canned responses and the package
 * stays dependency-free. Credentials (where a provider wants one) are resolved
 * by the caller through the F-8 `TokenStore` seam (`OrgConnectorCredential`,
 * encrypted at rest — #507) and passed in as `apiKey`; no provider reads a
 * secret itself.
 */

/** A normalized legal authority, the one shape every provider returns. */
export interface LegalAuthority {
  /** Provider-local stable id (docket id, CELEX number, accession number, …). */
  id: string;
  /** Registry id of the provider that found it ("courtlistener", "edgar", …). */
  provider: string;
  /** Short human label for the provider (for the "source · <label>" chip). */
  providerLabel: string;
  /** The authority kind, so the UI can badge caselaw vs statute vs filing. */
  type: "caselaw" | "statute" | "regulation" | "filing" | "eu-law" | "other";
  /** Case name / statute title / filing headline. */
  title: string;
  /** Formal citation where the provider gives one (reporter cite, CELEX, …). */
  citation?: string;
  /** Issuing court / agency / institution. */
  authority?: string;
  /** Jurisdiction code the result belongs to ("US", "US-FED", "EU", …). */
  jurisdiction?: string;
  /** Decision / enactment / filing date, ISO yyyy-mm-dd where known. */
  date?: string;
  /** Canonical, user-openable URL for the authority. */
  url?: string;
  /** Short excerpt / holding snippet the grounding prompt cites. */
  snippet: string;
}

/** A research request. */
export interface ResearchQuery {
  /** The natural-language or keyword query. */
  query: string;
  /** Optional jurisdiction filter ("US", "EU", …) — providers not matching are skipped. */
  jurisdiction?: string;
  /** Max authorities to return per provider (defaults applied by the provider). */
  limitPerProvider?: number;
}

/**
 * HTTP seam for provider calls. Mirrors the `OAuthHttp` pattern: the caller
 * injects a `fetch`-backed transport in production and a stub in tests, so a
 * provider never touches the network directly.
 */
export type ResearchHttp = (
  url: string,
  init: {
    method: "GET" | "POST";
    headers: Record<string, string>;
    body?: string;
  },
) => Promise<{ status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

/** Per-call context handed to a provider's `search`. */
export interface ResearchProviderContext {
  http: ResearchHttp;
  /** Resolved API key / token for this provider, if the org has one stored. */
  apiKey?: string;
  /**
   * Contact `User-Agent` some providers (EDGAR) require. The caller sets it to
   * an operator-identifying string; providers that need it read it here.
   */
  userAgent?: string;
  /** Overridable clock for deterministic tests. */
  now?: () => number;
}

/** A legal-research provider. */
export interface ResearchProvider {
  /** Stable registry id, also the `OrgConnectorCredential.connectorId` for its key. */
  id: string;
  /** Human label for the admin UI and the source chip. */
  label: string;
  /** The authority kind this provider returns. */
  type: LegalAuthority["type"];
  /** Jurisdiction codes this provider covers (used by the `jurisdiction` filter). */
  jurisdictions: string[];
  /**
   * Whether a stored credential is required for the provider to work at all.
   * All C-4 providers default to `false` — they work anonymously / on a public
   * key, and a stored key only raises rate limits or unlocks more results — so
   * the demo runs zero-config.
   */
  requiresCredential: boolean;
  /** Run the search. Throws on transport / parse failure; the service isolates it. */
  search(query: ResearchQuery, ctx: ResearchProviderContext): Promise<LegalAuthority[]>;
}

/** Per-provider outcome in a fan-out, so the surface can show what answered. */
export interface ProviderStatus {
  id: string;
  label: string;
  ok: boolean;
  count: number;
  error?: string;
}

/** The result of a fan-out across providers. */
export interface ResearchResult {
  /** Normalized authorities, numbered 1-based in `n` for `[n]` citation. */
  authorities: Array<LegalAuthority & { n: number }>;
  /** One entry per provider attempted. */
  providers: ProviderStatus[];
}
