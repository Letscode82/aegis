/**
 * AI billing-judge (SP-4) — the judgment layer over the deterministic
 * engine. The SP-1 rules surface "judgment" flags (block-billing, vague
 * narrative, excessive hours) but never reduce; this service asks the model
 * to assess each flagged line and RECOMMEND a short-pay + rationale. It only
 * proposes — the recommendation is written to an `AgentDecision` PENDING row
 * (service layer) and a human must approve before any money moves.
 *
 * Degrades to a deterministic default recommendation when the model is
 * unavailable, so the queue never stalls and every line carries a rationale.
 * Pure of DB — takes lines + flags, returns an assessment.
 */
import { callClaudeJSON, CLAUDE_MODEL } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";
import type { ReviewFlag, ReviewLineItem } from "./rules";

/** Judgment codes this service assesses (line-level, no auto-reduction). */
const JUDGMENT_CODES = new Set(["BLOCK_BILLING", "VAGUE_NARRATIVE", "EXCESSIVE_HOURS"]);

/** Deterministic fallback short-pay fraction per code (no model available). */
const DEFAULT_FRACTION: Record<string, number> = {
  BLOCK_BILLING: 0.15,
  VAGUE_NARRATIVE: 0.1,
  EXCESSIVE_HOURS: 0.15,
};

export interface JudgmentLineAssessment {
  lineId: string;
  code: string;
  billedAmount: number;
  /** Recommended short-pay in currency units (0 … billedAmount). */
  recommendedReduction: number;
  rationale: string;
}

export interface JudgmentAssessment {
  perLine: JudgmentLineAssessment[];
  totalRecommendedReduction: number;
  confidence: number | null;
  degraded: boolean;
  model: string;
  /** The prompt text, for the AgentDecision promptHash. */
  promptText: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function fallbackAssessment(items: Array<{ line: ReviewLineItem; codes: string[] }>): JudgmentLineAssessment[] {
  return items.map(({ line, codes }) => {
    // Take the largest default fraction among this line's judgment codes.
    const frac = Math.max(0, ...codes.map((c) => DEFAULT_FRACTION[c] ?? 0));
    const reduction = round2(line.amount * frac);
    const label = codes.map((c) => c.replace(/_/g, " ").toLowerCase()).join(", ");
    return {
      lineId: line.id,
      code: codes[0]!,
      billedAmount: round2(line.amount),
      recommendedReduction: reduction,
      rationale: `Deterministic guideline recommendation for ${label}: short-pay ${Math.round(frac * 100)}% pending reviewer confirmation.`,
    };
  });
}

/**
 * Assess an invoice's judgment-flagged lines. `flags` is the full flag set
 * from runInvoiceReview; only line-level judgment flags are assessed.
 */
export async function assessJudgment(
  lines: ReviewLineItem[],
  flags: ReviewFlag[],
): Promise<JudgmentAssessment> {
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const codesByLine = new Map<string, string[]>();
  for (const f of flags) {
    if (!f.lineId || f.severity !== "judgment" || !JUDGMENT_CODES.has(f.code)) continue;
    const existing = codesByLine.get(f.lineId);
    if (existing) existing.push(f.code);
    else codesByLine.set(f.lineId, [f.code]);
  }
  const items = [...codesByLine.entries()]
    .map(([lineId, codes]) => ({ line: lineById.get(lineId)!, codes }))
    .filter((x) => x.line);

  if (items.length === 0) {
    return { perLine: [], totalRecommendedReduction: 0, confidence: null, degraded: false, model: "none", promptText: "" };
  }

  const prompt = `You are a senior legal e-billing reviewer applying the client's outside-counsel guidelines. For each flagged line item below, decide whether the concern is valid and recommend a short-pay (a reduction of the billed amount). Be fair but firm: block-billing and vague narratives typically warrant a partial reduction (10-30%), not a full write-off; genuinely excessive hours may warrant more. Never exceed the billed amount.

Flagged lines (JSON):
${JSON.stringify(items.map(({ line, codes }) => ({ lineId: line.id, concerns: codes, hours: line.hours, rate: line.rate, billedAmount: round2(line.amount), narrative: line.description })), null, 2)}

Return ONLY JSON of this shape:
{"assessments":[{"lineId":"<id>","recommendedReductionPct":<0-100 number>,"rationale":"<one sentence>"}],"confidence":<0-1 number>}`;

  try {
    ensureServerClaudeTransport();
    const raw = await callClaudeJSON(prompt, { maxTokens: 1500, timeout: 45000 });
    const arr = Array.isArray(raw?.assessments) ? raw.assessments : [];
    const byLine = new Map<string, { pct: number; rationale: string }>();
    for (const a of arr) {
      const id = String(a?.lineId ?? "");
      const pct = Math.min(100, Math.max(0, Number(a?.recommendedReductionPct) || 0));
      if (id) byLine.set(id, { pct, rationale: String(a?.rationale ?? "").slice(0, 400) });
    }
    const perLine: JudgmentLineAssessment[] = items.map(({ line, codes }) => {
      const a = byLine.get(line.id);
      const pct = a ? a.pct : (Math.max(0, ...codes.map((c) => DEFAULT_FRACTION[c] ?? 0)) * 100);
      return {
        lineId: line.id,
        code: codes[0]!,
        billedAmount: round2(line.amount),
        recommendedReduction: round2(line.amount * (pct / 100)),
        rationale: a?.rationale || `Recommended ${Math.round(pct)}% short-pay for ${codes.join(", ").toLowerCase()}.`,
      };
    });
    const conf = Number(raw?.confidence);
    return {
      perLine,
      totalRecommendedReduction: round2(perLine.reduce((s, p) => s + p.recommendedReduction, 0)),
      confidence: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : null,
      degraded: false,
      model: CLAUDE_MODEL,
      promptText: prompt,
    };
  } catch {
    const perLine = fallbackAssessment(items);
    return {
      perLine,
      totalRecommendedReduction: round2(perLine.reduce((s, p) => s + p.recommendedReduction, 0)),
      confidence: null,
      degraded: true,
      model: "deterministic-fallback",
      promptText: prompt,
    };
  }
}
