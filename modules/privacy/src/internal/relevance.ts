/**
 * Deterministic relevance scoring (pure) — the always-available floor under
 * the AI relevance review (the "aiR" analog). Given the request's relevance
 * criteria and a collected item, it produces a verdict + confidence + a
 * human-readable rationale using keyword overlap plus a strong signal when the
 * data subject's own name/email appears. When @aegis/ai is configured the AI
 * pass replaces these numbers; when it isn't (or fails), this keeps the review
 * queue moving with an explainable, defensible baseline.
 */
import type { DSARReviewVerdict } from "@aegis/db";

const STOPWORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "would", "include", "including", "data", "personal",
  "information", "documents", "document", "relevant", "under", "processing", "which", "their", "have", "been",
  "such", "into", "any", "all", "not", "are", "was", "were", "his", "her", "its", "our", "your",
]);

export function tokenize(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9@.\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3 && !STOPWORDS.has(t));
}

export function verdictFromScore(score: number): DSARReviewVerdict {
  if (score >= 0.45) return "RELEVANT";
  if (score < 0.15) return "NOT_RELEVANT";
  return "UNCLEAR";
}

export interface RelevanceInput {
  criteria: string;
  subjectName?: string | null;
  subjectEmail?: string | null;
  item: { title: string; excerpt?: string | null; sourceSystem?: string | null };
}

export interface RelevanceResult {
  verdict: DSARReviewVerdict;
  score: number; // 0..1
  rationale: string;
}

/** Deterministic keyword-overlap relevance with a subject-identity boost. */
export function scoreRelevanceDeterministic(input: RelevanceInput): RelevanceResult {
  const critTokens = new Set(tokenize(input.criteria));
  const itemText = `${input.item.title} ${input.item.excerpt ?? ""}`;
  const itemTokens = tokenize(itemText);
  const itemSet = new Set(itemTokens);

  let overlap = 0;
  for (const t of critTokens) if (itemSet.has(t)) overlap += 1;
  const denom = Math.max(1, critTokens.size);
  let score = overlap / denom;

  // Strong identity signal: the subject's name or email appearing in the item.
  const haystack = itemText.toLowerCase();
  const nameHit = !!input.subjectName && input.subjectName.trim().length > 1 && haystack.includes(input.subjectName.trim().toLowerCase());
  const emailHit = !!input.subjectEmail && haystack.includes((input.subjectEmail || "").trim().toLowerCase());
  if (nameHit || emailHit) score = Math.min(1, score + 0.5);

  score = Math.round(Math.min(1, score) * 100) / 100;

  const reasons: string[] = [];
  if (emailHit) reasons.push("the data subject's email appears in the record");
  else if (nameHit) reasons.push("the data subject's name appears in the record");
  if (overlap > 0) reasons.push(`${overlap} of ${critTokens.size} scope keyword${critTokens.size === 1 ? "" : "s"} matched`);
  if (reasons.length === 0) reasons.push("no scope keywords or subject identifiers matched");

  const verdict = verdictFromScore(score);
  return { verdict, score, rationale: `Deterministic screen: ${reasons.join("; ")}.` };
}
