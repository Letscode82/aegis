/**
 * Contract collaboration / comments (CTR-10).
 *
 * Threaded discussion on a contract or a specific clause, with two audiences:
 *
 *   - INTERNAL — the back-and-forth between the business and internal legal.
 *     Never leaves the org; only internal users read/write it.
 *   - SHARED   — visible to the external counterparty on the review portal.
 *     This is how the internal side and the third party negotiate in the open,
 *     with a durable thread (not the ephemeral audit-metadata note the review
 *     link used to carry).
 *
 * Every add / resolve is chain-sealed. External comments come in through the
 * review-token path (addExternalContractComment) and are always SHARED.
 */
import { prisma, logAudit } from "@aegis/db";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };
export type CommentVisibility = "INTERNAL" | "SHARED";
export type CommentAudience = "internal" | "external";

export interface ContractCommentDTO {
  id: string;
  contractId: string;
  clauseId: string | null;
  parentId: string | null;
  visibility: CommentVisibility;
  body: string;
  authorName: string;
  authorRole: string | null;
  authorKind: "INTERNAL" | "EXTERNAL";
  resolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

export interface AddCommentInput {
  body: string;
  clauseId?: string | null;
  parentId?: string | null;
  visibility?: CommentVisibility;
}

async function loadContract(organizationId: string, contractId: string) {
  const contract = await prisma.contract.findFirst({ where: { id: contractId, organizationId }, select: { id: true } });
  if (!contract) throw new Error("Contract not found");
  return contract;
}

/** Internal user posts a comment. `visibility` chooses INTERNAL (business ↔
 *  legal, private) or SHARED (visible to the counterparty). */
export async function addContractComment(
  organizationId: string,
  contractId: string,
  input: AddCommentInput,
  actor: Actor,
): Promise<ContractCommentDTO> {
  await loadContract(organizationId, contractId);
  const body = input.body?.trim();
  if (!body) throw new Error("Comment body is required");
  const visibility: CommentVisibility = input.visibility === "SHARED" ? "SHARED" : "INTERNAL";

  const row = await prisma.contractComment.create({
    data: {
      organizationId,
      contractId,
      clauseId: input.clauseId ?? null,
      parentId: input.parentId ?? null,
      authorUserId: actor.id,
      visibility,
      body,
    },
  });
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
    action: "contract.comment.added",
    resourceType: "Contract",
    resourceId: contractId,
    afterJson: { commentId: row.id, visibility, clauseId: row.clauseId, parentId: row.parentId } as never,
    metadata: { source: "contracts" } as never,
  });
  return (await listContractComments(organizationId, contractId, "internal")).find((c) => c.id === row.id)!;
}

/** External counterparty posts a comment via the review link — always SHARED,
 *  attributed to their COUNTERPARTY_CONTACT Person. */
export async function addExternalContractComment(
  organizationId: string,
  contractId: string,
  personId: string,
  input: AddCommentInput,
): Promise<ContractCommentDTO> {
  await loadContract(organizationId, contractId);
  const body = input.body?.trim();
  if (!body) throw new Error("Comment body is required");

  const row = await prisma.contractComment.create({
    data: {
      organizationId,
      contractId,
      clauseId: input.clauseId ?? null,
      parentId: input.parentId ?? null,
      authorPersonId: personId,
      visibility: "SHARED",
      body,
    },
  });
  await logAudit({
    organizationId,
    actorId: null,
    actorType: "SYSTEM",
    action: "contract.comment.added",
    resourceType: "Contract",
    resourceId: contractId,
    afterJson: { commentId: row.id, visibility: "SHARED", external: true } as never,
    metadata: { source: "contract-review", personId } as never,
  });
  return (await listContractComments(organizationId, contractId, "external")).find((c) => c.id === row.id)!;
}

/**
 * List comments. `internal` returns everything; `external` returns only SHARED
 * comments (what the counterparty may see). Author names + roles are resolved
 * in one batched round-trip each.
 */
export async function listContractComments(
  organizationId: string,
  contractId: string,
  audience: CommentAudience,
): Promise<ContractCommentDTO[]> {
  const rows = await prisma.contractComment.findMany({
    where: {
      organizationId,
      contractId,
      ...(audience === "external" ? { visibility: "SHARED" as const } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  const userIds = Array.from(new Set(rows.map((r) => r.authorUserId).filter((x): x is string => !!x)));
  const personIds = Array.from(new Set(rows.map((r) => r.authorPersonId).filter((x): x is string => !!x)));
  const [users, persons] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, role: { select: { name: true } } } })
      : Promise.resolve([]),
    personIds.length
      ? prisma.person.findMany({ where: { id: { in: personIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const personById = new Map(persons.map((p) => [p.id, p]));

  return rows.map((r) => {
    const external = !!r.authorPersonId;
    const u = r.authorUserId ? userById.get(r.authorUserId) : null;
    const p = r.authorPersonId ? personById.get(r.authorPersonId) : null;
    return {
      id: r.id,
      contractId: r.contractId,
      clauseId: r.clauseId,
      parentId: r.parentId,
      visibility: r.visibility as CommentVisibility,
      body: r.body,
      authorName: external ? p?.name ?? "Counterparty" : u?.name ?? "Internal user",
      authorRole: external ? "Counterparty" : u?.role?.name ?? null,
      authorKind: external ? "EXTERNAL" : "INTERNAL",
      resolved: r.resolvedAt != null,
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

/** Resolve (close) or re-open a comment thread. Chain-sealed. */
export async function setContractCommentResolved(
  organizationId: string,
  commentId: string,
  resolved: boolean,
  actor: Actor,
): Promise<{ id: string; resolved: boolean }> {
  const existing = await prisma.contractComment.findFirst({ where: { id: commentId, organizationId }, select: { id: true, contractId: true } });
  if (!existing) throw new Error("Comment not found");
  await prisma.contractComment.update({
    where: { id: commentId },
    data: { resolvedAt: resolved ? new Date() : null, resolvedById: resolved ? actor.id : null },
  });
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
    action: resolved ? "contract.comment.resolved" : "contract.comment.reopened",
    resourceType: "Contract",
    resourceId: existing.contractId,
    afterJson: { commentId } as never,
    metadata: { source: "contracts" } as never,
  });
  return { id: commentId, resolved };
}
