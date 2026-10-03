/**
 * Legal-authority research layer (C-4) — the public surface.
 *
 * Caselaw (CourtListener), US statutes / CFR (GovInfo), SEC filings (EDGAR),
 * and EU law (EUR-Lex) behind one `ResearchProvider` interface, one fan-out
 * service, and one normalized `LegalAuthority` shape the console cites. Built on
 * the F-8 connector framework; provider credentials ride the same encrypted
 * `OrgConnectorCredential` persistence (#507), resolved by the caller.
 */
export type {
  LegalAuthority,
  ResearchQuery,
  ResearchHttp,
  ResearchProvider,
  ResearchProviderContext,
  ProviderStatus,
  ResearchResult,
} from "./research-types.js";

export { runResearch, selectProviders } from "./research-service.js";

export { courtListenerProvider } from "./research-courtlistener.js";
export { govInfoProvider } from "./research-govinfo.js";
export { edgarProvider } from "./research-edgar.js";
export { eurLexProvider, buildSparql } from "./research-eurlex.js";

import type { ResearchProvider } from "./research-types.js";
import { courtListenerProvider } from "./research-courtlistener.js";
import { govInfoProvider } from "./research-govinfo.js";
import { edgarProvider } from "./research-edgar.js";
import { eurLexProvider } from "./research-eurlex.js";

/** The C-4 provider set, in display order. */
export function defaultResearchProviders(): ResearchProvider[] {
  return [courtListenerProvider, govInfoProvider, edgarProvider, eurLexProvider];
}
