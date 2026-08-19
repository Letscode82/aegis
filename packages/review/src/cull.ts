/**
 * Persisted culls + exclusion log (RC-5). The Cull stage's suppression becomes
 * a durable, defensible decision: thread-suppressed and near-duplicate items are
 * marked excluded, dropping out of review and production, with a reason recorded
 * for the exclusion log. All chain-sealed (`reviewset.cull_*`).
 */
import { prisma, logAudit } from "@aegis/db";
import type { Actor } from "./reviewset";

export interface ApplyCullResult { threadSuppressed: number; nearDuplicate: number; total: number }

/** Exclude older thread messages + near-duplicates from review/production. */
export async function applyThreadNearDupCull(organizationId: string, reviewSetId: string, actor: Actor): Promise<ApplyCullResult> {
  const rs = await prisma.reviewSet.findFirst({ where: { id: reviewSetId, organizationId }, select: { id: true } });
  if (!rs) throw new Error("Review set not found");
  const items = await prisma.reviewSetItem.findMany({
    where: { reviewSetId, excludedAt: null },
    select: { id: true, isInclusive: true, dedupKey: true },
    orderBy: [{ createdAt: "asc" }],
  });
  const seen = new Set<string>();
  const threadIds: string[] = [];
  const dupIds: string[] = [];
  for (const i of items) {
    if (i.dedupKey) {
      if (seen.has(i.dedupKey)) { dupIds.push(i.id); continue; }
      seen.add(i.dedupKey);
    }
    if (i.isInclusive === false) threadIds.push(i.id);
  }
  const now = new Date();
  if (threadIds.length) await prisma.reviewSetItem.updateMany({ where: { id: { in: threadIds } }, data: { excludedAt: now, exclusionReason: "THREAD_SUPPRESSED" } });
  if (dupIds.length) await prisma.reviewSetItem.updateMany({ where: { id: { in: dupIds } }, data: { excludedAt: now, exclusionReason: "NEAR_DUPLICATE" } });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.cull_applied", resourceType: "ReviewSet", resourceId: reviewSetId,
    afterJson: { threadSuppressed: threadIds.length, nearDuplicate: dupIds.length } as never,
    metadata: { source: "review", channel: "ediscovery" } as never,
  });
  return { threadSuppressed: threadIds.length, nearDuplicate: dupIds.length, total: threadIds.length + dupIds.length };
}

/** Restore every culled item back into review. */
export async function clearCull(organizationId: string, reviewSetId: string, actor: Actor): Promise<{ restored: number }> {
  const rs = await prisma.reviewSet.findFirst({ where: { id: reviewSetId, organizationId }, select: { id: true } });
  if (!rs) throw new Error("Review set not found");
  const restored = await prisma.reviewSetItem.updateMany({ where: { reviewSetId, excludedAt: { not: null } }, data: { excludedAt: null, exclusionReason: null } });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.cull_cleared", resourceType: "ReviewSet", resourceId: reviewSetId,
    afterJson: { restored: restored.count } as never,
    metadata: { source: "review", channel: "ediscovery" } as never,
  });
  return { restored: restored.count };
}

export interface ExclusionEntry { id: string; title: string; sourceSystem: string; exclusionReason: string | null; excludedAt: string }

/** The exclusion log — every culled item + why. */
export async function listExclusions(organizationId: string, reviewSetId: string): Promise<ExclusionEntry[]> {
  const rows = await prisma.reviewSetItem.findMany({
    where: { reviewSetId, organizationId, excludedAt: { not: null } },
    select: { id: true, title: true, sourceSystem: true, exclusionReason: true, excludedAt: true },
    orderBy: [{ excludedAt: "desc" }],
  });
  return rows.map((r) => ({ id: r.id, title: r.title, sourceSystem: r.sourceSystem, exclusionReason: r.exclusionReason, excludedAt: r.excludedAt!.toISOString() }));
}
