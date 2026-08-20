/**
 * AIR-2 — "Draft with AI" for review instructions. Turns a plain-language
 * matter / investigation description into a starting review PROFILE: a
 * responsiveness criteria paragraph, a set of issue codes, and the dimensions
 * worth running. Pure and deterministic — the always-available floor.
 *
 * Respects the 4d Matter/Legal-Hold AI freeze (same posture as the review
 * scorer): this draft is a keyword-driven suggestion, never a model call. When
 * the freeze lifts, a Claude-backed drafter drops in behind `DraftedProfile`
 * with no caller change. The attorney always edits before saving — the draft is
 * a head start, not an authority.
 */
import type { ReviewTagKind } from "./types";
import { tokenize } from "./deterministic";

/** Issue code as the review PROFILE surface uses it (`{key,label}`) — distinct
 *  from the engine's per-issue responsiveness `ReviewIssue` (`{key,description}`). */
export interface DraftIssue { key: string; label: string }

export interface DraftProfileInput {
  /** The matter / investigation description, or any scope prose. */
  description: string;
  /** Optional label (matter type / investigation name) to anchor the criteria. */
  context?: string;
}

export interface DraftedProfile {
  name: string;
  criteria: string;
  issues: DraftIssue[];
  dimensions: ReviewTagKind[];
  /** Always true here — a deterministic draft, not a model call. */
  degraded: boolean;
}

/** Common eDiscovery issue themes → the terms that signal them. Keyword hits
 *  promote a theme into the suggested issue codes. */
const ISSUE_THEMES: Array<{ key: string; label: string; terms: string[] }> = [
  { key: "FINANCIAL", label: "Financial / accounting", terms: ["revenue", "invoice", "payment", "accounting", "financial", "budget", "expense", "audit", "forecast"] },
  { key: "IP_TRADE_SECRET", label: "IP / trade secret", terms: ["trade", "secret", "patent", "source", "proprietary", "invention", "design", "engineering", "confidential"] },
  { key: "EMPLOYMENT", label: "Employment / HR", terms: ["employee", "employment", "harassment", "termination", "hiring", "compensation", "performance", "manager"] },
  { key: "CONTRACT", label: "Contract / commercial", terms: ["contract", "agreement", "vendor", "supplier", "sow", "renewal", "termination", "breach", "obligation"] },
  { key: "ANTITRUST", label: "Antitrust / competition", terms: ["pricing", "competitor", "market", "collusion", "monopoly", "cartel", "bid"] },
  { key: "COMPLIANCE", label: "Regulatory / compliance", terms: ["compliance", "regulatory", "sanctions", "bribery", "fcpa", "kickback", "export", "aml"] },
  { key: "COMMUNICATIONS", label: "Key communications", terms: ["email", "message", "call", "meeting", "slack", "teams", "conversation"] },
];

function titleize(s: string): string {
  const t = (s || "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** Draft a review profile from a description. Deterministic; the attorney edits. */
export function draftReviewCriteria(input: DraftProfileInput): DraftedProfile {
  const desc = (input.description || "").trim();
  const ctx = (input.context || "").trim();
  const tokens = tokenize(`${ctx} ${desc}`);
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);

  // Salient keywords: most frequent non-stopword tokens, longest first as a
  // deterministic tiebreak.
  const salient = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 8)
    .map(([t]) => t);

  // Issue themes: any theme with a keyword hit, ranked by hit count.
  const tokenSet = new Set(tokens);
  const themed = ISSUE_THEMES
    .map((th) => ({ th, hits: th.terms.filter((term) => tokenSet.has(term)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 4)
    .map((x) => ({ key: x.th.key, label: x.th.label }));
  const issues: DraftIssue[] = themed.length > 0 ? themed : [{ key: "RESPONSIVE", label: "Responsive to the matter" }];

  const scopeClause = salient.length > 0 ? ` Prioritize documents mentioning: ${salient.join(", ")}.` : "";
  const criteria = desc
    ? `A document is responsive if it relates to ${ctx ? `${ctx.toLowerCase()} — ` : ""}${desc.replace(/\s+/g, " ").slice(0, 600)}.${scopeClause}`
    : `A document is responsive if it relates to ${ctx || "the matter"}.${scopeClause}`;

  const name = ctx ? `${titleize(ctx)} — review profile` : "Draft review profile";
  // Sensible default dimensions for eDiscovery/investigation review.
  const dimensions: ReviewTagKind[] = ["RESPONSIVE", "PRIVILEGED", "PII", "KEY_DOCUMENT"];

  return { name, criteria, issues, dimensions, degraded: true };
}
