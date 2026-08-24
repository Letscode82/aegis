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

// ── Extra cull passes (keyword / junk pattern + source type) ─────────

/** Built-in junk starters — automated / low-value mail patterns. */
export const JUNK_PATTERNS = [
  "unsubscribe", "no-reply", "noreply", "newsletter", "out of office",
  "automatic reply", "calendar invite", "daily digest", "notification@",
];

interface CullableItem { id: string; title?: string | null; excerpt?: string | null; sourceType?: string | null }

/** Pure: ids of items whose title/excerpt contains any pattern (case-insensitive). */
export function selectKeywordCullIds(items: CullableItem[], patterns: string[]): string[] {
  const pats = patterns.map((p) => (p || "").trim().toLowerCase()).filter(Boolean);
  if (pats.length === 0) return [];
  return items
    .filter((it) => {
      const hay = `${it.title ?? ""}  ${it.excerpt ?? ""}`.toLowerCase();
      return pats.some((p) => hay.includes(p));
    })
    .map((it) => it.id);
}

/** Pure: ids of items whose sourceType is in the given list (case-insensitive). */
export function selectSourceTypeCullIds(items: CullableItem[], sourceTypes: string[]): string[] {
  const set = new Set(sourceTypes.map((s) => (s || "").trim().toUpperCase()).filter(Boolean));
  if (set.size === 0) return [];
  return items.filter((it) => it.sourceType && set.has(it.sourceType.toUpperCase())).map((it) => it.id);
}

export interface CullPassResult { excluded: number; total: number }

/** Exclude items matching keyword / junk patterns. Reversible + chain-sealed. */
export async function applyKeywordCull(organizationId: string, reviewSetId: string, patterns: string[], actor: Actor): Promise<CullPassResult> {
  const rs = await prisma.reviewSet.findFirst({ where: { id: reviewSetId, organizationId }, select: { id: true } });
  if (!rs) throw new Error("Review set not found");
  const items = await prisma.reviewSetItem.findMany({ where: { reviewSetId, excludedAt: null }, select: { id: true, title: true, excerpt: true } });
  const ids = selectKeywordCullIds(items, patterns);
  const now = new Date();
  if (ids.length) await prisma.reviewSetItem.updateMany({ where: { id: { in: ids } }, data: { excludedAt: now, exclusionReason: "KEYWORD_EXCLUDED" } });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.cull_applied", resourceType: "ReviewSet", resourceId: reviewSetId,
    afterJson: { kind: "keyword", patterns: patterns.map((p) => (p || "").trim()).filter(Boolean), excluded: ids.length } as never,
    metadata: { source: "review", channel: "ediscovery" } as never,
  });
  return { excluded: ids.length, total: ids.length };
}

/** Exclude an entire source type (e.g. all TEAMS chat). Reversible + chain-sealed. */
export async function applySourceTypeCull(organizationId: string, reviewSetId: string, sourceTypes: string[], actor: Actor): Promise<CullPassResult> {
  const rs = await prisma.reviewSet.findFirst({ where: { id: reviewSetId, organizationId }, select: { id: true } });
  if (!rs) throw new Error("Review set not found");
  const items = await prisma.reviewSetItem.findMany({ where: { reviewSetId, excludedAt: null }, select: { id: true, sourceType: true } });
  const ids = selectSourceTypeCullIds(items, sourceTypes);
  const now = new Date();
  if (ids.length) await prisma.reviewSetItem.updateMany({ where: { id: { in: ids } }, data: { excludedAt: now, exclusionReason: "SOURCE_EXCLUDED" } });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.cull_applied", resourceType: "ReviewSet", resourceId: reviewSetId,
    afterJson: { kind: "source", sourceTypes: sourceTypes.map((s) => (s || "").trim().toUpperCase()).filter(Boolean), excluded: ids.length } as never,
    metadata: { source: "review", channel: "ediscovery" } as never,
  });
  return { excluded: ids.length, total: ids.length };
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
