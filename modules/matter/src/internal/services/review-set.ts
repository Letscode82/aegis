/**
 * Review sets — persisted eDiscovery / DSAR collections. A collection preview
 * (hold-scoped or DSAR-scoped) is committed here into a durable `ReviewSet`
 * whose `ReviewSetItem`s feed the reviewer console. This is the seam between
 * the ephemeral "collect & preview" step and the "code & produce" step.
 *
 * Chain-sealed via logAudit (`reviewset.*`). Freezing snapshots the set for
 * review; producing marks it exported. Coding lives in review-set-coding.ts.
 */
import { randomUUID } from "node:crypto";
import { prisma, logAudit } from "@aegis/db";
import type { ReviewSetOrigin } from "@aegis/db";
import { getM365ClientForOrg } from "./m365-factory";
import { draftCollectionQuery } from "./collection-query";
import { assignThreadingAndDedup } from "./review-threading";
import { holdCustodianEmails } from "../legal-hold/services/hold-collection";
import type { DataSubjectSourceType, DataSubjectHit } from "./m365";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

export interface ReviewIssue { key: string; label: string }

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

async function persistSet(
  organizationId: string,
  data: { origin: ReviewSetOrigin; name: string; queryString: string; sources: string[]; legalHoldId?: string | null; matterId?: string | null; dataSubjectRequestId?: string | null; custodianCount: number; simulated: boolean },
  hits: DataSubjectHit[],
  actor: Actor,
): Promise<ReviewSetSummary> {
  const rs = await prisma.reviewSet.create({
    data: {
      organizationId, origin: data.origin, name: data.name, queryString: data.queryString, sources: data.sources,
      legalHoldId: data.legalHoldId ?? null, matterId: data.matterId ?? null, dataSubjectRequestId: data.dataSubjectRequestId ?? null,
      custodianCount: data.custodianCount, simulated: data.simulated, createdById: actor.id,
    },
  });
  // Assign explicit ids so attachment children can link to their parent email
  // (family) in a single createMany, and thread/dedup the message-level hits.
  const parents = hits.map((h) => ({ id: randomUUID(), hit: h }));
  const assign = assignThreadingAndDedup(
    parents.map((p) => ({ id: p.id, subject: p.hit.title, body: p.hit.excerpt, conversationId: p.hit.conversationId ?? null, sentAt: p.hit.sentAt ?? null })),
  );
  type ItemRow = {
    id: string; organizationId: string; reviewSetId: string; sourceType: string; sourceSystem: string; title: string;
    excerpt: string | null; graphId: string | null; webUrl: string | null;
    familyId: string | null; familyRole: string | null; threadId: string | null; isInclusive: boolean | null; dedupKey: string | null;
  };
  const rows: ItemRow[] = [];
  for (const p of parents) {
    const a = assign.get(p.id)!;
    const atts = p.hit.attachments ?? [];
    const hasFamily = atts.length > 0;
    rows.push({
      id: p.id, organizationId, reviewSetId: rs.id, sourceType: p.hit.sourceType, sourceSystem: p.hit.sourceSystem,
      title: p.hit.title, excerpt: p.hit.excerpt ?? null, graphId: p.hit.graphId ?? null, webUrl: p.hit.webUrl ?? null,
      familyId: hasFamily ? p.id : null, familyRole: hasFamily ? "PARENT" : null,
      threadId: a.threadId, isInclusive: a.isInclusive, dedupKey: a.dedupKey,
    });
    for (const att of atts) {
      rows.push({
        id: randomUUID(), organizationId, reviewSetId: rs.id, sourceType: p.hit.sourceType, sourceSystem: p.hit.sourceSystem,
        title: att.name, excerpt: att.contentType ? `Attachment · ${att.contentType}` : "Attachment", graphId: null, webUrl: null,
        familyId: p.id, familyRole: "ATTACHMENT", threadId: a.threadId, isInclusive: a.isInclusive, dedupKey: null,
      });
    }
  }
  if (rows.length > 0) await prisma.reviewSetItem.createMany({ data: rows as never });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.created", resourceType: "ReviewSet", resourceId: rs.id,
    afterJson: { origin: data.origin, name: data.name, items: rows.length, queryString: data.queryString } as never,
    metadata: { source: "matter", channel: "ediscovery" } as never,
  });
  return toSummary(rs.id);
}

export interface CommitHoldCollectionInput {
  name?: string;
  queryString?: string | null;
  naturalLanguage?: string | null;
  sources?: DataSubjectSourceType[];
  top?: number;
}

/** Run a hold's custodian-scoped collection and persist it as a ReviewSet. */
export async function commitHoldCollection(legalHoldId: string, input: CommitHoldCollectionInput, actor: Actor): Promise<ReviewSetSummary> {
  const hold = await prisma.legalHold.findUnique({ where: { id: legalHoldId }, select: { id: true, organizationId: true, matterId: true, title: true, holdNumber: true } });
  if (!hold) throw new Error("Hold not found");
  const emails = await holdCustodianEmails(legalHoldId);

  let queryString = (input.queryString || "").trim();
  if (!queryString) queryString = draftCollectionQuery({ naturalLanguage: input.naturalLanguage || "", custodianEmails: emails }).queryString;

  // Per-custodian enumeration (per-user endpoints honor app-only permissions;
  // the unified /search/query does not return mail/chat app-only). Mirrors
  // previewHoldCollection so commit persists exactly what preview showed.
  const client = await getM365ClientForOrg(hold.organizationId);
  const res = await client.searchForDataSubject({ identifiers: emails, sources: input.sources, top: input.top ?? 200 });
  const name = (input.name || "").trim() || `${hold.holdNumber || hold.title} — collection`;

  return persistSet(
    hold.organizationId,
    { origin: "LEGAL_HOLD", name, queryString, sources: (input.sources ?? ["MAILBOX", "ONEDRIVE", "TEAMS"]) as string[], legalHoldId, matterId: hold.matterId, custodianCount: emails.length, simulated: res.simulated },
    res.hits,
    actor,
  );
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
    metadata: { source: "matter", channel: "ediscovery" } as never,
  });
  return toSummary(id);
}

export async function getReviewSetSummary(organizationId: string, id: string): Promise<ReviewSetSummary | null> {
  const rs = await prisma.reviewSet.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!rs) return null;
  return toSummary(id);
}
