/**
 * AI-assisted review over a review set (AIR-3) — the shared multi-dimension
 * engine (@aegis/ai-review) applied to eDiscovery/culling items. It tags each
 * item across responsive / privileged / PII / key / redact with confidence +
 * citation, and routes it (AUTO_CULL / REVIEWER / ATTORNEY). The tags are
 * SUGGESTIONS: a human still codes every item in the reviewer console (the
 * PENDING → coded gate is unchanged).
 *
 * Respects the 4d Matter/Legal-Hold AI freeze: this runs the engine's
 * deterministic screen (no `@aegis/ai` model call). When 4d unfreezes, a
 * Claude-backed pass drops in behind the same `@aegis/ai-review` interface with
 * no schema or caller change.
 */
import { prisma, logAudit } from "@aegis/db";
import { reviewDeterministic, summarizeRoutes, type ReviewInstruction, type ReviewItem, type ReviewTagKind } from "@aegis/ai-review";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

export interface RunReviewSetAiInput {
  /** Scope/criteria prompt. Defaults to the review set's name + query. */
  criteria?: string;
  /** Per-issue responsiveness (investigations). */
  issues?: Array<{ key: string; description: string }>;
  dimensions?: ReviewTagKind[];
  /** Only score items not yet coded (default true). */
  pendingOnly?: boolean;
}

export interface RunReviewSetAiResult {
  scored: number;
  routes: { total: number; attorney: number; reviewer: number; autoCull: number };
  degraded: boolean;
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

  const rows = await prisma.reviewSetItem.findMany({
    where: { reviewSetId, ...(input.pendingOnly === false ? {} : { reviewDecision: "PENDING" }) },
    select: { id: true, title: true, excerpt: true, sourceSystem: true },
    orderBy: [{ createdAt: "asc" }],
  });
  if (rows.length === 0) return { scored: 0, routes: { total: 0, attorney: 0, reviewer: 0, autoCull: 0 }, degraded: true };

  const instruction: ReviewInstruction = {
    criteria: (input.criteria || "").trim() || (rs.criteria || "").trim() || `${rs.name}. Collection query: ${rs.queryString}`,
    issues: input.issues ?? (storedIssues.length > 0 ? storedIssues : undefined),
    dimensions: input.dimensions,
  };
  const items: ReviewItem[] = rows.map((r) => ({ id: r.id, title: r.title, text: r.excerpt, sourceSystem: r.sourceSystem }));

  // 4d-frozen: deterministic screen only (the shared engine's fallback path).
  const results = reviewDeterministic(instruction, items);

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

  const routes = summarizeRoutes(results.map((r) => r.route));
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.ai_review_run", resourceType: "ReviewSet", resourceId: reviewSetId,
    afterJson: { scored: results.length, routes } as never,
    metadata: { source: "matter", channel: "ediscovery", degraded: true } as never,
  });

  return { scored: results.length, routes, degraded: true };
}
