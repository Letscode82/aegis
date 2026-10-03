/**
 * Legal-authority research service (C-4).
 *
 * Fans one query out across the enabled research providers, isolates each one
 * so a slow or failing provider never sinks the answer, and returns the merged
 * authorities numbered 1-based for `[n]` citation (the number the grounding
 * prompt and the C-13 `enforceCitations` check both key off).
 *
 * Pure orchestration over injected providers + context — no network, no DB, no
 * provider imports — so it unit-tests against stub providers.
 */
import type {
  LegalAuthority,
  ProviderStatus,
  ResearchProvider,
  ResearchProviderContext,
  ResearchQuery,
  ResearchResult,
} from "./research-types.js";

/** Filter providers to those that serve the requested jurisdiction (all, if none). */
export function selectProviders(providers: ResearchProvider[], jurisdiction?: string): ResearchProvider[] {
  if (!jurisdiction) return providers;
  const want = jurisdiction.toUpperCase();
  const matched = providers.filter((p) => p.jurisdictions.some((j) => j.toUpperCase() === want || want.startsWith(`${j.toUpperCase()}-`) || j.toUpperCase().startsWith(`${want}-`)));
  // Never strip to nothing on an unknown jurisdiction — fall back to all providers.
  return matched.length ? matched : providers;
}

/**
 * Run a research fan-out.
 *
 * @param args.providers    the providers to try.
 * @param args.query        the research query.
 * @param args.contextFor   resolves per-provider context (http + optional apiKey).
 *                          Called once per provider so each gets its own key.
 */
export async function runResearch(args: {
  providers: ResearchProvider[];
  query: ResearchQuery;
  contextFor: (provider: ResearchProvider) => ResearchProviderContext | Promise<ResearchProviderContext>;
}): Promise<ResearchResult> {
  const chosen = selectProviders(args.providers, args.query.jurisdiction);

  const settled = await Promise.all(
    chosen.map(async (provider): Promise<{ provider: ResearchProvider; authorities: LegalAuthority[]; error?: string }> => {
      try {
        const ctx = await args.contextFor(provider);
        const authorities = await provider.search(args.query, ctx);
        return { provider, authorities: Array.isArray(authorities) ? authorities : [] };
      } catch (e) {
        return { provider, authorities: [], error: String((e as Error)?.message || e) };
      }
    }),
  );

  const providers: ProviderStatus[] = [];
  const numbered: Array<LegalAuthority & { n: number }> = [];
  const seen = new Set<string>();

  for (const { provider, authorities, error } of settled) {
    let kept = 0;
    for (const a of authorities) {
      const key = `${a.provider}:${a.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      numbered.push({ ...a, n: numbered.length + 1 });
      kept += 1;
    }
    providers.push({ id: provider.id, label: provider.label, ok: !error, count: kept, error });
  }

  return { authorities: numbered, providers };
}
