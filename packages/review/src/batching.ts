/**
 * Review batching + assignment + second-level QC (reviewer-parity v3). A review
 * set is split into batches, each assigned to a first-pass reviewer; when the
 * reviewer submits, a QC reviewer approves or rejects each coded item. All
 * chain-sealed (`reviewset.batch.*`).
 *
 * Batch lifecycle: DRAFT → ASSIGNED → IN_REVIEW → QC → COMPLETE.
 * Item QC: null → PENDING_QC → QC_APPROVED | QC_REJECTED.
 */
import { prisma, logAudit } from "@aegis/db";
import type { Actor } from "./reviewset";

export type BatchStatus = "DRAFT" | "ASSIGNED" | "IN_REVIEW" | "QC" | "COMPLETE";

export interface ReviewBatchDTO {
  id: string;
  name: string;
  status: string;
  assignedToUserId: string | null;
  itemCount: number;
  codedCount: number;
  qcPending: number;
  qcApproved: number;
  qcRejected: number;
}

async function toBatchDTO(batchId: string): Promise<ReviewBatchDTO> {
  const b = await prisma.reviewBatch.findUniqueOrThrow({ where: { id: batchId } });
  const items = await prisma.reviewSetItem.findMany({ where: { batchId }, select: { reviewDecision: true, qcStatus: true } });
  return {
    id: b.id, name: b.name, status: b.status, assignedToUserId: b.assignedToUserId,
    itemCount: items.length,
    codedCount: items.filter((i) => i.reviewDecision !== "PENDING").length,
    qcPending: items.filter((i) => i.qcStatus === "PENDING_QC").length,
    qcApproved: items.filter((i) => i.qcStatus === "QC_APPROVED").length,
    qcRejected: items.filter((i) => i.qcStatus === "QC_REJECTED").length,
  };
}

export interface CreateReviewBatchInput {
  name: string;
  /** Explicit item ids to batch. */
  itemIds?: string[];
  /** Or: pull up to N currently-unbatched items into the batch. */
  autoSize?: number;
  assignedToUserId?: string | null;
}

/** Create a batch and assign items to it (explicit ids, or the first N
 *  unbatched items). Chain-sealed. */
export async function createReviewBatch(organizationId: string, reviewSetId: string, input: CreateReviewBatchInput, actor: Actor): Promise<ReviewBatchDTO> {
  const rs = await prisma.reviewSet.findFirst({ where: { id: reviewSetId, organizationId }, select: { id: true } });
  if (!rs) throw new Error("Review set not found");

  let itemIds = input.itemIds ?? [];
  if (itemIds.length === 0 && input.autoSize && input.autoSize > 0) {
    const rows = await prisma.reviewSetItem.findMany({ where: { reviewSetId, batchId: null, excludedAt: null }, select: { id: true }, take: input.autoSize, orderBy: [{ createdAt: "asc" }] });
    itemIds = rows.map((r) => r.id);
  }

  const batch = await prisma.reviewBatch.create({
    data: { organizationId, reviewSetId, name: input.name.trim() || "Batch", assignedToUserId: input.assignedToUserId ?? null, status: input.assignedToUserId ? "ASSIGNED" : "DRAFT", createdById: actor.id },
  });
  if (itemIds.length > 0) {
    await prisma.reviewSetItem.updateMany({
      where: { id: { in: itemIds }, reviewSetId },
      data: { batchId: batch.id, assignedToUserId: input.assignedToUserId ?? null },
    });
  }
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.batch.created", resourceType: "ReviewSet", resourceId: reviewSetId,
    afterJson: { batchId: batch.id, name: batch.name, items: itemIds.length, assignedToUserId: batch.assignedToUserId } as never,
    metadata: { source: "review", channel: "ediscovery" } as never,
  });
  return toBatchDTO(batch.id);
}

export async function listReviewBatches(organizationId: string, reviewSetId: string): Promise<ReviewBatchDTO[]> {
  const batches = await prisma.reviewBatch.findMany({ where: { organizationId, reviewSetId }, orderBy: [{ createdAt: "asc" }], select: { id: true } });
  return Promise.all(batches.map((b) => toBatchDTO(b.id)));
}

async function loadBatch(organizationId: string, batchId: string) {
  const b = await prisma.reviewBatch.findFirst({ where: { id: batchId, organizationId } });
  if (!b) throw new Error("Batch not found");
  return b;
}

/** Assign (or reassign) a batch to a reviewer; cascades to its items. */
export async function assignReviewBatch(organizationId: string, batchId: string, assignedToUserId: string | null, actor: Actor): Promise<ReviewBatchDTO> {
  const b = await loadBatch(organizationId, batchId);
  await prisma.reviewBatch.update({ where: { id: batchId }, data: { assignedToUserId, status: assignedToUserId ? "ASSIGNED" : "DRAFT" } });
  await prisma.reviewSetItem.updateMany({ where: { batchId }, data: { assignedToUserId } });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.batch.assigned", resourceType: "ReviewSet", resourceId: b.reviewSetId,
    afterJson: { batchId, assignedToUserId } as never, metadata: { source: "review", channel: "ediscovery" } as never,
  });
  return toBatchDTO(batchId);
}

/** Submit a batch for QC: its coded items enter PENDING_QC; batch → QC. */
export async function submitBatchForQc(organizationId: string, batchId: string, actor: Actor): Promise<ReviewBatchDTO> {
  const b = await loadBatch(organizationId, batchId);
  const uncoded = await prisma.reviewSetItem.count({ where: { batchId, reviewDecision: "PENDING" } });
  if (uncoded > 0) throw new Error(`${uncoded} item(s) in this batch are uncoded — finish first-pass review before submitting for QC.`);
  await prisma.reviewSetItem.updateMany({ where: { batchId }, data: { qcStatus: "PENDING_QC" } });
  await prisma.reviewBatch.update({ where: { id: batchId }, data: { status: "QC" } });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.batch.submitted_for_qc", resourceType: "ReviewSet", resourceId: b.reviewSetId,
    afterJson: { batchId } as never, metadata: { source: "review", channel: "ediscovery" } as never,
  });
  return toBatchDTO(batchId);
}

/** Second-level QC decision on one item. Rejecting reopens it for re-review. */
export async function resolveItemQc(organizationId: string, itemId: string, approve: boolean, actor: Actor): Promise<{ itemId: string; qcStatus: string }> {
  const item = await prisma.reviewSetItem.findFirst({ where: { id: itemId, organizationId }, select: { id: true, reviewSetId: true } });
  if (!item) throw new Error("Review item not found");
  const qcStatus = approve ? "QC_APPROVED" : "QC_REJECTED";
  const data: Record<string, unknown> = { qcStatus, qcById: actor.id };
  // A rejection reopens the item for re-review (back to PENDING coding).
  if (!approve) data.reviewDecision = "PENDING";
  await prisma.reviewSetItem.update({ where: { id: itemId }, data: data as never });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.item.qc", resourceType: "ReviewSet", resourceId: item.reviewSetId,
    afterJson: { itemId, qcStatus } as never, metadata: { source: "review", channel: "ediscovery" } as never,
  });
  return { itemId, qcStatus };
}

/** Mark a batch complete once QC has cleared it. */
export async function completeReviewBatch(organizationId: string, batchId: string, actor: Actor): Promise<ReviewBatchDTO> {
  const b = await loadBatch(organizationId, batchId);
  const pending = await prisma.reviewSetItem.count({ where: { batchId, qcStatus: "PENDING_QC" } });
  if (pending > 0) throw new Error(`${pending} item(s) still awaiting QC.`);
  await prisma.reviewBatch.update({ where: { id: batchId }, data: { status: "COMPLETE" } });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.batch.completed", resourceType: "ReviewSet", resourceId: b.reviewSetId,
    afterJson: { batchId } as never, metadata: { source: "review", channel: "ediscovery" } as never,
  });
  return toBatchDTO(batchId);
}
