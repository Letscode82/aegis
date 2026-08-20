/**
 * AIR-4 — pilot → validate → scale. Before trusting an AI review across a whole
 * collection, you validate it against human judgment on a representative sample,
 * then (only if the metrics hold) apply the AI's confident, cited calls at scale
 * while failing closed on anything uncertain.
 *
 *   1. startValidationPilot   — stratified-sample the AI-scored items across
 *                               route × confidence band; humans code the sample.
 *   2. computeValidationMetrics — recall / precision / overturn of the AI vs the
 *                               human ground truth on the coded sample.
 *   3. applyAtScale           — auto-accept the AI decision on the remaining
 *                               items where it is confident AND cited; leave
 *                               uncited-high-confidence and low-confidence items
 *                               PENDING for a human ("fail closed").
 *
 * The human gate is preserved: a person triggers each step, codes the sample,
 * and clicks apply-at-scale — the AI never finalizes on its own. Chain-sealed
 * via logAudit (`reviewset.validation.*`). Metrics math is `@aegis/validation`.
 */
import { prisma, logAudit } from "@aegis/db";
import { recallPrecision, overturnRate, stratifiedSample, type CodedItem } from "@aegis/validation";
import { routeTags, DEFAULT_THRESHOLDS, type ReviewTag } from "@aegis/ai-review";

export type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };
export type ValidationDimension = "RESPONSIVE" | "PRIVILEGED";

export interface ValidationRunSummary {
  id: string;
  reviewSetId: string;
  dimension: ValidationDimension;
  status: string;
  sampleSize: number;
  codedInSample: number;
  metrics: ValidationMetricsDTO | null;
  scaledAt: string | null;
  appliedCount: number | null;
  failClosedCount: number | null;
  createdAt: string;
}

export interface ValidationMetricsDTO {
  n: number;
  recall: number | null;
  recallCI: { low: number; high: number } | null;
  precision: number | null;
  precisionCI: { low: number; high: number } | null;
  f1: number | null;
  overturn: number | null;
  matrix: { tp: number; fp: number; fn: number; tn: number };
  codedInSample: number;
}

/** Read the AI's positive call for a dimension off a stored item. */
function aiPositive(dimension: ValidationDimension, aiTags: unknown, aiVerdict: string | null): boolean {
  const tags = Array.isArray(aiTags) ? (aiTags as unknown as ReviewTag[]) : [];
  if (dimension === "PRIVILEGED") return tags.some((t) => t.kind === "PRIVILEGED" && t.value);
  const resp = tags.find((t) => t.kind === "RESPONSIVE" && (t.issueKey == null || t.issueKey === undefined)) ?? tags.find((t) => t.kind === "RESPONSIVE");
  if (resp) return !!resp.value;
  return aiVerdict === "RELEVANT";
}

function confidenceBand(score: number | null): string {
  const s = score ?? 0;
  return s >= 0.7 ? "high" : s >= 0.4 ? "mid" : "low";
}

async function countCodedInSample(reviewSetId: string, runId: string): Promise<number> {
  return prisma.reviewSetItem.count({ where: { reviewSetId, pilotRunId: runId, reviewDecision: { not: "PENDING" } } });
}

async function toSummary(runId: string): Promise<ValidationRunSummary> {
  const run = await prisma.reviewValidationRun.findUniqueOrThrow({ where: { id: runId } });
  const codedInSample = await countCodedInSample(run.reviewSetId, run.id);
  return {
    id: run.id, reviewSetId: run.reviewSetId, dimension: run.dimension as ValidationDimension,
    status: run.status, sampleSize: run.sampleSize, codedInSample,
    metrics: (run.metricsJson as ValidationMetricsDTO | null) ?? null,
    scaledAt: run.scaledAt?.toISOString() ?? null, appliedCount: run.appliedCount ?? null,
    failClosedCount: run.failClosedCount ?? null, createdAt: run.createdAt.toISOString(),
  };
}

export interface StartPilotInput { sampleSize?: number; dimension?: ValidationDimension }

/** Draw a stratified validation sample from the AI-scored items. Requires the
 *  AI review to have run (items carry aiRoute). Chain-sealed. */
export async function startValidationPilot(organizationId: string, reviewSetId: string, input: StartPilotInput, actor: Actor): Promise<ValidationRunSummary> {
  const rs = await prisma.reviewSet.findFirst({ where: { id: reviewSetId, organizationId }, select: { id: true, reviewProfileId: true, reviewProfileVersion: true } });
  if (!rs) throw new Error("Review set not found");
  const dimension: ValidationDimension = input.dimension === "PRIVILEGED" ? "PRIVILEGED" : "RESPONSIVE";
  const sampleSize = Math.max(1, Math.min(500, Math.floor(input.sampleSize ?? 25)));

  const scored = await prisma.reviewSetItem.findMany({
    where: { reviewSetId, excludedAt: null, aiRoute: { not: null } },
    select: { id: true, aiRoute: true, aiScore: true },
    orderBy: [{ createdAt: "asc" }],
  });
  if (scored.length === 0) throw new Error("Run the AI review before starting a validation pilot — no scored items to sample.");

  const sample = stratifiedSample(scored, (i) => `${i.aiRoute}:${confidenceBand(i.aiScore)}`, sampleSize);
  const run = await prisma.reviewValidationRun.create({
    data: { organizationId, reviewSetId, dimension, sampleSize: sample.length, status: "AWAITING_CODING", profileId: rs.reviewProfileId, profileVersion: rs.reviewProfileVersion, createdById: actor.id },
  });
  await prisma.reviewSetItem.updateMany({ where: { id: { in: sample.map((s) => s.id) } }, data: { pilotRunId: run.id } });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.validation.pilot_started", resourceType: "ReviewValidationRun", resourceId: run.id,
    afterJson: { reviewSetId, dimension, sampleSize: sample.length } as never,
    metadata: { source: "review", channel: "ediscovery" } as never,
  });
  return toSummary(run.id);
}

/** Compute recall / precision / overturn of the AI vs human coding on the coded
 *  sample. Chain-sealed. */
export async function computeValidationMetrics(organizationId: string, runId: string, actor: Actor): Promise<ValidationRunSummary> {
  const run = await prisma.reviewValidationRun.findFirst({ where: { id: runId, organizationId } });
  if (!run) throw new Error("Validation run not found");
  const dimension = run.dimension as ValidationDimension;
  const items = await prisma.reviewSetItem.findMany({
    where: { reviewSetId: run.reviewSetId, pilotRunId: runId, reviewDecision: { not: "PENDING" } },
    select: { aiTags: true, aiVerdict: true, codedResponsive: true, codedPrivileged: true },
  });
  if (items.length === 0) throw new Error("Code the sampled items before computing metrics — no coded items in the sample yet.");

  const coded: CodedItem[] = items.map((it) => ({
    predictedPositive: aiPositive(dimension, it.aiTags, it.aiVerdict),
    actualPositive: dimension === "PRIVILEGED" ? !!it.codedPrivileged : it.codedResponsive === true,
  }));
  const m = recallPrecision(coded);
  const o = overturnRate(coded);
  const metrics: ValidationMetricsDTO = {
    n: m.n, recall: m.recall, recallCI: m.recallCI, precision: m.precision, precisionCI: m.precisionCI,
    f1: m.f1, overturn: o.rate, matrix: m.matrix, codedInSample: items.length,
  };
  await prisma.reviewValidationRun.update({ where: { id: runId }, data: { metricsJson: metrics as never, status: "COMPUTED" } });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.validation.metrics_computed", resourceType: "ReviewValidationRun", resourceId: runId,
    afterJson: { recall: m.recall, precision: m.precision, f1: m.f1, overturn: o.rate, n: m.n } as never,
    metadata: { source: "review", channel: "ediscovery" } as never,
  });
  return toSummary(runId);
}

export interface ApplyAtScaleResult { applied: number; appliedResponsive: number; appliedNonResponsive: number; failClosed: number }

/** Apply the AI decision to the remaining (non-sampled, still-PENDING) items
 *  where the engine is confident and cited; fail closed (leave PENDING) on
 *  uncited-high-confidence, low-confidence, and privileged items. A human
 *  triggers this — it is the batch-approval gate. Chain-sealed. */
export async function applyAtScale(organizationId: string, runId: string, actor: Actor): Promise<ValidationRunSummary & { result: ApplyAtScaleResult }> {
  const run = await prisma.reviewValidationRun.findFirst({ where: { id: runId, organizationId } });
  if (!run) throw new Error("Validation run not found");
  const dimension = run.dimension as ValidationDimension;

  const items = await prisma.reviewSetItem.findMany({
    where: { reviewSetId: run.reviewSetId, excludedAt: null, reviewDecision: "PENDING", pilotRunId: null, aiRoute: { not: null } },
    select: { id: true, aiTags: true, aiVerdict: true },
  });

  const applyTrue: string[] = [];
  const applyFalse: string[] = [];
  let failClosed = 0;
  for (const it of items) {
    const tags = Array.isArray(it.aiTags) ? (it.aiTags as unknown as ReviewTag[]) : [];
    // Re-route with fromModel semantics so uncited-high-confidence fails closed.
    const route = routeTags(tags, { ...DEFAULT_THRESHOLDS, fromModel: true });
    if (route === "ATTORNEY" || tags.length === 0) { failClosed += 1; continue; }
    if (aiPositive(dimension, it.aiTags, it.aiVerdict)) applyTrue.push(it.id);
    else applyFalse.push(it.id);
  }

  const note = `Applied at scale from validation run ${runId}`;
  await prisma.$transaction([
    ...(applyTrue.length ? [prisma.reviewSetItem.updateMany({ where: { id: { in: applyTrue } }, data: { codedResponsive: true, reviewDecision: "CONFIRMED", reviewedById: actor.id, reviewedAt: new Date(), reviewNote: note } })] : []),
    ...(applyFalse.length ? [prisma.reviewSetItem.updateMany({ where: { id: { in: applyFalse } }, data: { codedResponsive: false, reviewDecision: "CONFIRMED", reviewedById: actor.id, reviewedAt: new Date(), reviewNote: note } })] : []),
    prisma.reviewValidationRun.update({ where: { id: runId }, data: { status: "SCALED", scaledAt: new Date(), appliedCount: applyTrue.length + applyFalse.length, failClosedCount: failClosed } }),
  ]);
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.validation.applied_at_scale", resourceType: "ReviewValidationRun", resourceId: runId,
    afterJson: { applied: applyTrue.length + applyFalse.length, appliedResponsive: applyTrue.length, appliedNonResponsive: applyFalse.length, failClosed } as never,
    metadata: { source: "review", channel: "ediscovery" } as never,
  });
  const summary = await toSummary(runId);
  return { ...summary, result: { applied: applyTrue.length + applyFalse.length, appliedResponsive: applyTrue.length, appliedNonResponsive: applyFalse.length, failClosed } };
}

export async function listValidationRuns(organizationId: string, reviewSetId: string): Promise<ValidationRunSummary[]> {
  const runs = await prisma.reviewValidationRun.findMany({ where: { organizationId, reviewSetId }, orderBy: [{ createdAt: "desc" }], select: { id: true } });
  return Promise.all(runs.map((r) => toSummary(r.id)));
}
