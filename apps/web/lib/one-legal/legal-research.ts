/**
 * Legal-authority research orchestrator (C-4).
 *
 * The one impure entry point behind `POST /api/one-legal/research`: it resolves
 * each provider's optional API key from the encrypted `OrgConnectorCredential`
 * store (F-8 / #507), fans the query across the C-4 providers over a real
 * `fetch` transport, grounds a Claude answer in the authorities, and runs the
 * C-13 `enforceCitations` guard so a hallucinated `[n]` never reaches the
 * reader. It degrades at every layer — no authorities, or no model — so the
 * console never stalls.
 *
 * All deterministic logic lives in `legal-research-core.ts` (unit-tested); this
 * module is only the live edges (DB creds + HTTP + the model call).
 */
import { prisma, encryptSecret, decryptSecret } from "@aegis/db";
import { callClaude, enforceCitations } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";
import {
  DbTokenStore,
  defaultResearchProviders,
  runResearch,
  type ConnectorCredentialClient,
  type ResearchHttp,
  type ResearchProvider,
} from "@aegis/connectors";
import {
  LEGAL_RESEARCH_SYSTEM,
  buildGroundedContext,
  extractiveAnswer,
  inferJurisdiction,
  type LegalResearchResponse,
  type ResearchSource,
} from "./legal-research-core";

/** SEC fair-access requires an identifying User-Agent; include a contact. */
const EDGAR_USER_AGENT = process.env.AEGIS_EDGAR_USER_AGENT || "AEGIS Legal Operations legal-ops@aegis-demo.example";

/** A `fetch`-backed research transport with a hard timeout per call. */
function makeHttp(timeoutMs = 12_000): ResearchHttp {
  return async (url, init) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: init.method,
        headers: init.headers,
        body: init.body,
        signal: ctrl.signal,
      });
      return { status: res.status, json: () => res.json(), text: () => res.text() };
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Resolve a provider's stored API key for this org (best-effort; null when none). */
async function resolveApiKey(store: DbTokenStore, organizationId: string, provider: ResearchProvider): Promise<string | undefined> {
  try {
    const token = await store.get(organizationId, provider.id);
    return token?.accessToken || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Run legal-authority research for an org and compose a cited, grounded answer.
 */
export async function runLegalResearch(input: {
  organizationId: string;
  question: string;
  jurisdiction?: string;
  limitPerProvider?: number;
}): Promise<LegalResearchResponse> {
  const providers = defaultResearchProviders();
  // The generated Prisma client is structurally stricter than the store's
  // injected-client interface (Record-typed create/update); the cast is the
  // intended wiring seam (#507 — "apps/web wires the real prisma singleton").
  const store = new DbTokenStore(prisma as unknown as ConnectorCredentialClient, { encryptSecret, decryptSecret });
  const http = makeHttp();
  const jurisdiction = input.jurisdiction || inferJurisdiction(input.question);

  const result = await runResearch({
    providers,
    query: { query: input.question, jurisdiction, limitPerProvider: input.limitPerProvider ?? 4 },
    contextFor: async (provider) => ({
      http,
      apiKey: await resolveApiKey(store, input.organizationId, provider),
      userAgent: EDGAR_USER_AGENT,
    }),
  });

  const sources: ResearchSource[] = result.authorities;
  const grounded = sources.length > 0;

  let answer = "";
  let degraded = false;

  if (!grounded) {
    // No external authority matched — answer honestly rather than inventing one.
    return {
      answer:
        "I couldn't find a matching authority in the connected legal databases (caselaw, US statutes/CFR, SEC filings, EU law). " +
        "Try narrower terms, a specific case or citation, or name the jurisdiction. A qualified lawyer should confirm any point before you rely on it.",
      grounded: false,
      degraded: false,
      sources: [],
      providers: result.providers,
    };
  }

  try {
    ensureServerClaudeTransport();
    const context = buildGroundedContext(sources);
    answer = ((await callClaude(`Question: ${input.question}\n\nLegal authorities:\n${context}`, { system: LEGAL_RESEARCH_SYSTEM, maxTokens: 800, timeout: 22000 })) || "").trim();
    if (!answer) throw new Error("empty");
  } catch {
    degraded = true;
    answer = extractiveAnswer(sources);
  }

  // C-13 — enforce inline [n] against the authorities we actually retrieved.
  // Only meaningful on the model-composed path; the extractive fallback cites
  // real authorities by construction.
  let citations: LegalResearchResponse["citations"];
  if (!degraded) {
    const checked = enforceCitations(answer, sources);
    answer = checked.text;
    citations = { cited: checked.citedIndices, dropped: checked.droppedCitations, warnings: checked.warnings };
  }

  return { answer, grounded: true, degraded, sources, providers: result.providers, citations };
}
