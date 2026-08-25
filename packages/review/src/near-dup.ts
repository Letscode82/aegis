/**
 * PROC-9 (on-the-fly read) — near-duplicate groups over a collection, computed
 * on demand from item text (no stored column yet; persistence is a later
 * migration). Bounded to keep the pairwise pass cheap.
 */
import { prisma } from "@aegis/db";
import { nearDuplicateGroups, type NearDupGroup } from "./similarity";

const MAX_ITEMS = 600;

export interface NearDupResult {
  groups: Array<NearDupGroup & { titles: string[] }>;
  scanned: number;
  duplicateDocs: number;
}

export async function getNearDuplicates(
  organizationId: string,
  reviewSetId: string,
  threshold = 0.8,
): Promise<NearDupResult> {
  const rs = await prisma.reviewSet.findFirst({ where: { id: reviewSetId, organizationId }, select: { id: true } });
  if (!rs) throw new Error("Review set not found");
  const items = await prisma.reviewSetItem.findMany({
    where: { reviewSetId, excludedAt: null },
    select: { id: true, title: true, excerpt: true },
    take: MAX_ITEMS,
    orderBy: [{ createdAt: "asc" }],
  });
  const titleById = new Map(items.map((i) => [i.id, i.title]));
  const groups = nearDuplicateGroups(items.map((i) => ({ id: i.id, text: i.excerpt })), { threshold });
  return {
    groups: groups.map((g) => ({ ...g, titles: g.ids.map((id) => titleById.get(id) ?? id).slice(0, 6) })),
    scanned: items.length,
    duplicateDocs: groups.reduce((n, g) => n + (g.size - 1), 0),
  };
}
