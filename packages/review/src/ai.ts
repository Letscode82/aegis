/**
 * AI-assisted review over a review set (AIR-3) — the shared multi-dimension
 * engine (@aegis/ai-review) applied to eDiscovery/culling items. It tags each
 * item across responsive / privileged / PII / key / redact with confidence +
 * citation, and routes it (AUTO_CULL / REVIEWER / ATTORNEY). The tags are
 * SUGGESTIONS: a human still codes every item in the reviewer console (the
 * PENDING → coded gate is unchanged).
 *
 * 4d — LLM per-document review is the default: Claude reasons over each document
 * + the review criteria/issues and emits cited, confidence-scored tags across
 * all five dimensions, routing each item. It runs as a fleet of bounded-
 * concurrency batch calls (an agentic reviewer over the set). The deterministic
 * screen is the degrade-safe fallback — no key or a failed batch drops straight
 * to it, and it also fills any single document the model skips, so a run is
 * always complete. The tags stay SUGGESTIONS: a human still codes every item
 * (the PENDING → coded gate, or the "Accept all AI calls" bulk approve).
 */
import { prisma, logAudit } from "@aegis/db";
import { buildReviewPrompt, parseAiReview, reviewDeterministic, summarizeRoutes, type ReviewInstruction, type ReviewItem, type ReviewItemResult, type ReviewTagKind } from "@aegis/ai-review";
import { CLAUDE_MODEL, callClaudeJSON } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

// Batch size keeps each Claude call focused (better citations) and lets one
// failed batch degrade in isolation; concurrency caps parallel calls.
const REVIEW_BATCH_SIZE = 8;
const REVIEW_CONCURRENCY = 4;
// Per-run item ceiling — beyond this, use the resumable batch runner (AIR-6)
// so a single request can't run for minutes.
const MAX_ITEMS_PER_RUN = 400;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await fn(items[idx]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * LLM-first scoring: Claude reviews each batch and emits cited tags; the
 * deterministic screen is the fallback (no key / failed batch) and fills any
 * document the model omits. Returns complete, routed results for every item.
 */
async function scoreItems(instruction: ReviewInstruction, items: ReviewItem[]): Promise<ReviewItemResult[]> {
  try {
    ensureServerClaudeTransport();
  } catch {
    return reviewDeterministic(instruction, items); // no model key → deterministic
  }
  const batches = chunk(items, REVIEW_BATCH_SIZE);
  const perBatch = await mapLimit(batches, REVIEW_CONCURRENCY, async (batch) => {
    try {
      const prompt = buildReviewPrompt(instruction, batch);
      const raw = await callClaudeJSON(prompt, { maxTokens: 2000, timeout: 60000 });
      return parseAiReview(raw, instruction, batch);
    } catch (e) {
      console.error("[ai-review] batch failed, deterministic fallback:", e);
      return reviewDeterministic(instruction, batch);
    }
  });
  return perBatch.flat();
}

export interface RunReviewSetAiInput {
  /** Scope/criteria prompt. Defaults to the review set's name + query. */
  criteria?: string;
  /** Per-issue responsiveness (investigations). */
  issues?: Array<{ key: string; description: string }>;
  dimensions?: ReviewTagKind[];
  /** Only score items not yet coded (default true). */
  pendingOnly?: boolean;
  /**
   * Batch-runner mode: score only items that carry no AI route yet
   * (`aiRoute IS NULL`). Because scoring sets the route, each call makes forward
   * progress — loop until `remaining` reaches 0 to review a set of any size
   * without one request running for minutes. Overrides `pendingOnly`.
   */
  unscoredOnly?: boolean;
}

export interface RunReviewSetAiResult {
  scored: number;
  routes: { total: number; attorney: number; reviewer: number; autoCull: number };
  degraded: boolean;
  /** The model that reviewed, or null when the deterministic screen ran. */
  model: string | null;
  /** How many of the scored items came from the model vs. the fallback. */
  byModel: number;
  /** Batch mode: items still unscored after this call (0 when the set is done). */
  remaining: number;
}

/** Map the RESPONSIVE tag onto the existing aiVerdict for at-a-glance display. */
function verdictFromTags(tags: { kind: string; value: boolean; confidence: number }[]): { verdict: "RELEVANT" | "NOT_RELEVANT" | "UNCLEAR"; score: number } {
  const resp = tags.find((t) => t.kind === "RESPONSIVE");
  if (!resp) return { verdict: "UNCLEAR", score: 0.5 };
  if (resp.value) return { verdict: "RELEVANT", score: resp.confidence };
  return { verdict: resp.confidence >= 0.6 ? "NOT_RELEVANT" : "UNCLEAR", score: resp.confidence };
}

export async function runAiReviewOnReviewSet(organizationId: string, reviewSetId: string, input: RunReviewSetAiInput, actor: Actor): Promise<RunReviewSetAiResult> {
  const rs = await prisma.reviewSet.findFirst({ where: { id: reviewSetId, organizationId }, select: { id: true, name: true, queryString: true, criteria: true, issuesJson: true } });
  if (!rs) throw new Error("Review set not found");
  const storedIssues = ((rs.issuesJson as Array<{ key: string; label: string }> | null) ?? []).map((i) => ({ key: i.key, description: i.label }));

  const scopeWhere = input.unscoredOnly
    ? { aiRoute: null }
    : input.pendingOnly === false
      ? {}
      : { reviewDecision: "PENDING" as const };
  const rows = await prisma.reviewSetItem.findMany({
    where: { reviewSetId, excludedAt: null, ...scopeWhere },
    select: { id: true, title: true, excerpt: true, sourceSystem: true },
    orderBy: [{ createdAt: "asc" }],
    take: MAX_ITEMS_PER_RUN,
  });
  if (rows.length === 0) return { scored: 0, routes: { total: 0, attorney: 0, reviewer: 0, autoCull: 0 }, degraded: true, model: null, byModel: 0, remaining: 0 };

  const instruction: ReviewInstruction = {
    criteria: (input.criteria || "").trim() || (rs.criteria || "").trim() || `${rs.name}. Collection query: ${rs.queryString}`,
    issues: input.issues ?? (storedIssues.length > 0 ? storedIssues : undefined),
    dimensions: input.dimensions,
  };
  const items: ReviewItem[] = rows.map((r) => ({ id: r.id, title: r.title, text: r.excerpt, sourceSystem: r.sourceSystem }));

  // 4d: LLM-first per-document review, degrading per-batch to the deterministic
  // screen. `degraded` on each result marks whether the model or the fallback
  // produced it.
  const results = await scoreItems(instruction, items);
  const byModel = results.filter((r) => !r.degraded).length;
  const degraded = byModel === 0;
  const model = degraded ? null : CLAUDE_MODEL;

  await prisma.$transaction(
    results.map((res) => {
      const { verdict, score } = verdictFromTags(res.tags);
      const cited = res.tags.find((t) => t.value && t.citation)?.citation ?? null;
      return prisma.reviewSetItem.update({
        where: { id: res.itemId },
        data: {
          aiVerdict: verdict,
          aiScore: score,
          aiRationale: res.tags.map((t) => `${t.kind}${t.issueKey ? `:${t.issueKey}` : ""}=${t.value}`).join(", ") + (cited ? ` [cite: ${cited}]` : ""),
          aiTags: res.tags as never,
          aiRoute: res.route,
        },
      });
    }),
  );

  const remaining = input.unscoredOnly
    ? await prisma.reviewSetItem.count({ where: { reviewSetId, excludedAt: null, aiRoute: null } })
    : 0;

  const routes = summarizeRoutes(results.map((r) => r.route));
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.ai_review_run", resourceType: "ReviewSet", resourceId: reviewSetId,
    afterJson: { scored: results.length, routes, byModel, degraded, remaining } as never,
    metadata: { source: "review", channel: "ediscovery", degraded, model } as never,
  });

  return { scored: results.length, routes, degraded, model, byModel, remaining };
}
