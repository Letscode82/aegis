/**
 * Review sets — persisted eDiscovery / DSAR collections. A collection (hold-
 * scoped, DSAR-scoped, or investigation-scoped) is committed here into a
 * durable `ReviewSet` whose `ReviewSetItem`s feed the shared reviewer console.
 * This is the seam between the ephemeral "collect" step (module-specific — it
 * knows M365 / custodians / data subjects) and the shared "code & produce"
 * step. Collection lives in each consuming module; persistence + reads live
 * here.
 *
 * Chain-sealed via logAudit (`reviewset.*`). Freezing snapshots the set for
 * review; producing marks it exported. Coding lives in coding.ts.
 */
import { randomUUID } from "node:crypto";
import { prisma, logAudit } from "@aegis/db";
import { contentHash } from "./hashing";
import { detectLanguage } from "./similarity";
import type { ReviewSetOrigin } from "@aegis/db";
import { assignThreadingAndDedup } from "./threading";

export type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

export interface ReviewIssue { key: string; label: string }

/** A collected document handed to the review set. Modules map their own
 *  collection result (M365 hits, DSAR records, …) onto this shape. */
export interface ReviewCollectedItem {
  sourceType: string;
  sourceSystem: string;
  title: string;
  excerpt: string | null;
  /** Extraction exception code for the top-level item (PROC-5/8) — e.g. an
   *  ingested archive file that couldn't be read. Attachments carry their own. */
  exception?: string | null;
  graphId?: string | null;
  webUrl?: string | null;
  conversationId?: string | null;
  sentAt?: string | null;
  attachments?: Array<{ name: string; size?: number | null; contentType?: string | null; text?: string | null; exception?: string | null }>;
}

export interface ReviewSetSummary {
  id: string;
  origin: ReviewSetOrigin;
  status: string;
  name: string;
  queryString: string;
  criteria: string | null;
  issues: ReviewIssue[];
  sources: string[];
  legalHoldId: string | null;
  matterId: string | null;
  dataSubjectRequestId: string | null;
  custodianCount: number;
  simulated: boolean;
  itemCount: number;
  frozenAt: string | null;
  producedAt: string | null;
  createdAt: string;
}

async function toSummary(id: string): Promise<ReviewSetSummary> {
  const rs = await prisma.reviewSet.findUniqueOrThrow({ where: { id }, include: { _count: { select: { items: true } } } });
  return {
    id: rs.id, origin: rs.origin, status: rs.status, name: rs.name, queryString: rs.queryString,
    criteria: rs.criteria ?? null, issues: (rs.issuesJson as ReviewIssue[] | null) ?? [], sources: rs.sources,
    legalHoldId: rs.legalHoldId, matterId: rs.matterId, dataSubjectRequestId: rs.dataSubjectRequestId,
    custodianCount: rs.custodianCount, simulated: rs.simulated, itemCount: rs._count.items,
    frozenAt: rs.frozenAt?.toISOString() ?? null, producedAt: rs.producedAt?.toISOString() ?? null, createdAt: rs.createdAt.toISOString(),
  };
}

export interface PersistReviewSetInput {
  origin: ReviewSetOrigin;
  name: string;
  queryString: string;
  sources: string[];
  legalHoldId?: string | null;
  matterId?: string | null;
  dataSubjectRequestId?: string | null;
  custodianCount: number;
  simulated: boolean;
}

/** Create a review set and its items from a collection result — grouping email
 *  attachments into families and stamping thread / dedup / inclusive on every
 *  row. Chain-sealed. The shared persistence seam for every consuming module. */
export async function persistReviewSet(
  organizationId: string,
  data: PersistReviewSetInput,
  hits: ReviewCollectedItem[],
  actor: Actor,
): Promise<ReviewSetSummary> {
  const rs = await prisma.reviewSet.create({
    data: {
      organizationId, origin: data.origin, name: data.name, queryString: data.queryString, sources: data.sources,
      legalHoldId: data.legalHoldId ?? null, matterId: data.matterId ?? null, dataSubjectRequestId: data.dataSubjectRequestId ?? null,
      custodianCount: data.custodianCount, simulated: data.simulated, createdById: actor.id,
    },
  });
  const parents = hits.map((h) => ({ id: randomUUID(), hit: h }));
  const assign = assignThreadingAndDedup(
    parents.map((p) => ({ id: p.id, subject: p.hit.title, body: p.hit.excerpt, conversationId: p.hit.conversationId ?? null, sentAt: p.hit.sentAt ?? null })),
  );
  type ItemRow = {
    id: string; organizationId: string; reviewSetId: string; sourceType: string; sourceSystem: string; title: string;
    excerpt: string | null; graphId: string | null; webUrl: string | null; sentAt: Date | null;
    contentHash: string | null; language: string | null; processingException: string | null;
    familyId: string | null; familyRole: string | null; threadId: string | null; isInclusive: boolean | null; dedupKey: string | null;
  };
  // Processing signals (PROC-5/8/9): content hash + language when there's text;
  // exception code when extraction failed. Computed once per item at collect.
  const proc = (text: string | null, exception?: string | null) => {
    const t = (text ?? "").trim();
    return {
      contentHash: t ? contentHash(t) : null,
      language: t ? detectLanguage(t) : null,
      processingException: exception ?? null,
    };
  };
  const toDate = (iso: string | null | undefined): Date | null => {
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isNaN(t) ? null : new Date(t);
  };
  const rows: ItemRow[] = [];
  for (const p of parents) {
    const a = assign.get(p.id)!;
    const atts = p.hit.attachments ?? [];
    const hasFamily = atts.length > 0;
    const sentAt = toDate(p.hit.sentAt);
    rows.push({
      id: p.id, organizationId, reviewSetId: rs.id, sourceType: p.hit.sourceType, sourceSystem: p.hit.sourceSystem,
      title: p.hit.title, excerpt: p.hit.excerpt ?? null, graphId: p.hit.graphId ?? null, webUrl: p.hit.webUrl ?? null, sentAt,
      ...proc(p.hit.excerpt ?? null, p.hit.exception ?? null),
      familyId: hasFamily ? p.id : null, familyRole: hasFamily ? "PARENT" : null,
      threadId: a.threadId, isInclusive: a.isInclusive, dedupKey: a.dedupKey,
    });
    for (const att of atts) {
      rows.push({
        id: randomUUID(), organizationId, reviewSetId: rs.id, sourceType: p.hit.sourceType, sourceSystem: p.hit.sourceSystem,
        title: att.name, excerpt: att.text || (att.contentType ? `Attachment · ${att.contentType}` : "Attachment"), graphId: null, webUrl: null, sentAt,
        ...proc(att.text ?? null, att.exception ?? null),
        familyId: p.id, familyRole: "ATTACHMENT", threadId: a.threadId, isInclusive: a.isInclusive, dedupKey: null,
      });
    }
  }
  if (rows.length > 0) await prisma.reviewSetItem.createMany({ data: rows as never });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.created", resourceType: "ReviewSet", resourceId: rs.id,
    afterJson: { origin: data.origin, name: data.name, items: rows.length, queryString: data.queryString } as never,
    metadata: { source: "review", channel: "ediscovery" } as never,
  });
  return toSummary(rs.id);
}

export interface ListReviewSetsFilter {
  legalHoldId?: string;
  dataSubjectRequestId?: string;
  origin?: ReviewSetOrigin;
}

export async function listReviewSets(organizationId: string, filter: ListReviewSetsFilter = {}): Promise<ReviewSetSummary[]> {
  const rows = await prisma.reviewSet.findMany({
    where: { organizationId, ...(filter.legalHoldId && { legalHoldId: filter.legalHoldId }), ...(filter.dataSubjectRequestId && { dataSubjectRequestId: filter.dataSubjectRequestId }), ...(filter.origin && { origin: filter.origin }) },
    include: { _count: { select: { items: true } } },
    orderBy: [{ createdAt: "desc" }],
  });
  return rows.map((rs) => ({
    id: rs.id, origin: rs.origin, status: rs.status, name: rs.name, queryString: rs.queryString,
    criteria: rs.criteria ?? null, issues: (rs.issuesJson as ReviewIssue[] | null) ?? [], sources: rs.sources,
    legalHoldId: rs.legalHoldId, matterId: rs.matterId, dataSubjectRequestId: rs.dataSubjectRequestId,
    custodianCount: rs.custodianCount, simulated: rs.simulated, itemCount: rs._count.items,
    frozenAt: rs.frozenAt?.toISOString() ?? null, producedAt: rs.producedAt?.toISOString() ?? null, createdAt: rs.createdAt.toISOString(),
  }));
}

/** Set the review set's responsiveness criteria + issue codes (drives AI review
 *  + multi-issue coding). Chain-sealed. */
export async function setReviewSetCriteria(
  organizationId: string,
  id: string,
  input: { criteria?: string | null; issues?: ReviewIssue[] },
  actor: Actor,
): Promise<ReviewSetSummary> {
  const rs = await prisma.reviewSet.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!rs) throw new Error("Review set not found");
  const issues = (input.issues ?? []).filter((i) => i && i.key && i.label).map((i) => ({ key: i.key.trim(), label: i.label.trim() }));
  await prisma.reviewSet.update({
    where: { id },
    data: { criteria: (input.criteria ?? "").trim() || null, issuesJson: issues as never },
  });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.criteria_updated", resourceType: "ReviewSet", resourceId: id,
    afterJson: { criteria: input.criteria ?? null, issues } as never,
    metadata: { source: "review", channel: "ediscovery" } as never,
  });
  return toSummary(id);
}

export async function getReviewSetSummary(organizationId: string, id: string): Promise<ReviewSetSummary | null> {
  const rs = await prisma.reviewSet.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!rs) return null;
  return toSummary(id);
}

/** Lifecycle stage derived from status + coding progress — drives the
 *  eDiscovery hub's stage tracker without a schema column. */
export type CollectionStage = "INTAKE" | "REVIEW" | "READY" | "FROZEN" | "PRODUCED";
export function deriveStage(status: string, itemCount: number, codedCount: number): CollectionStage {
  if (status === "PRODUCED") return "PRODUCED";
  if (status === "FROZEN") return "FROZEN";
  if (itemCount === 0) return "INTAKE";
  return codedCount >= itemCount ? "READY" : "REVIEW";
}

export interface CollectionSummary extends ReviewSetSummary { codedCount: number; stage: CollectionStage }

/** Every review set (collection) across the org, with coded progress + a
 *  derived lifecycle stage — the eDiscovery hub's cross-source read. */
export async function listCollections(organizationId: string): Promise<CollectionSummary[]> {
  const sets = await listReviewSets(organizationId);
  if (sets.length === 0) return [];
  const coded = await prisma.reviewSetItem.groupBy({
    by: ["reviewSetId"],
    where: { organizationId, reviewSetId: { in: sets.map((s) => s.id) }, reviewDecision: { not: "PENDING" } },
    _count: { _all: true },
  });
  const codedBy = new Map(coded.map((c) => [c.reviewSetId, c._count._all]));
  return sets.map((s) => {
    const codedCount = codedBy.get(s.id) ?? 0;
    return { ...s, codedCount, stage: deriveStage(s.status, s.itemCount, codedCount) };
  });
}
