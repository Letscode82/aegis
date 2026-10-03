/**
 * Legal-authority research — pure core (C-4).
 *
 * The deterministic pieces of ONE Legal's "research the law" capability: the
 * grounding system prompt, the numbered context the model cites, the mapping
 * from `@aegis/connectors` authorities to the console's source shape, and the
 * extractive fallback used when the model is offline. Kept free of `fetch`,
 * Prisma, and the Anthropic client so it unit-tests without any runtime — the
 * orchestrator (`legal-research.ts`) wires these to the live edges.
 */
import type { LegalAuthority } from "@aegis/connectors";

/** A numbered authority, as the API returns it to the console. */
export type ResearchSource = LegalAuthority & { n: number };

/**
 * System prompt for the grounded answer. Mirrors the posture of the K1.3
 * document-grounded prompt (`/ask`) but over *external legal authorities*: cite
 * inline `[n]`, never invent a holding or a citation, and always flag that this
 * is not definitive legal advice.
 */
export const LEGAL_RESEARCH_SYSTEM =
  "You are AEGIS, a legal-research assistant for a corporate General Counsel team. " +
  "Answer the question USING ONLY the numbered legal authorities below — real caselaw, statutes, " +
  "regulations, filings, and EU instruments retrieved from public legal databases. " +
  "Cite sources inline as [n] matching the authorities you actually relied on. State the holding or rule " +
  "each authority supplies; do NOT invent case names, citations, holdings, or dates. " +
  "If the authorities do not answer the question, say so plainly and suggest what to search for next. " +
  "Keep it tight — a direct answer, then the supporting authorities. " +
  "This is legal research, NOT definitive legal advice; note that a qualified lawyer must review before relying on it.";

/** Build the numbered context block the grounding prompt cites. */
export function buildGroundedContext(sources: ResearchSource[]): string {
  return sources
    .map((s) => {
      const header = [s.title, s.citation, s.authority, s.date].filter(Boolean).join(" · ");
      return `[${s.n}] ${header}\n${s.snippet}`;
    })
    .join("\n\n");
}

/** The deterministic extractive answer shown when the model is unavailable. */
export function extractiveAnswer(sources: ResearchSource[]): string {
  const lines = sources
    .slice(0, 5)
    .map((s) => {
      const cite = s.citation ? ` (${s.citation})` : "";
      const body = s.snippet.length > 220 ? `${s.snippet.slice(0, 219)}…` : s.snippet;
      return `• ${s.title}${cite} [${s.n}]: ${body}`;
    })
    .join("\n\n");
  return (
    "Relevant legal authorities:\n\n" +
    lines +
    "\n\n(AI synthesis is offline; showing the authorities retrieved. A qualified lawyer should review before relying on these.)"
  );
}

/**
 * Infer a jurisdiction filter from the question when the user names one, so a
 * question about EU / GDPR law doesn't fan out to US-only databases (and vice
 * versa). Returns `undefined` when nothing is named — the service then tries
 * every provider.
 */
export function inferJurisdiction(question: string): string | undefined {
  const q = question.toLowerCase();
  const eu = /\b(eu|european union|gdpr|eur-?lex|cjeu|directive|european commission|member state)\b/.test(q);
  const us = /\b(us|u\.s\.|united states|scotus|federal|circuit|cfr|u\.s\.c|sec|edgar|congress)\b/.test(q);
  if (eu && !us) return "EU";
  if (us && !eu) return "US";
  return undefined;
}

/** Shape of the normalized research response (shared by the route + console). */
export interface LegalResearchResponse {
  answer: string;
  grounded: boolean;
  degraded: boolean;
  sources: ResearchSource[];
  providers: Array<{ id: string; label: string; ok: boolean; count: number; error?: string }>;
  citations?: { cited: number[]; dropped: number; warnings: string[] };
}
