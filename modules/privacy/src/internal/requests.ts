/**
 * DSAR request lifecycle — the case-handling core of the Privacy module.
 *
 * Create → assign a handler (DPO) → verify identity → collect → review →
 * deliver, every transition guarded by the state machine and chain-sealed via
 * logAudit (`privacy.dsar.*`). Denormalised fields on DataSubjectRequest are a
 * fast-read materialisation; the AuditLog is the legal record. Conservative
 * governance: nothing here auto-advances — a human drives each step, and an
 * ERASURE can't reach FULFILLED while a legal hold preserves the subject's
 * data (guard enforced here, computed in hold-guard.ts).
 */
import { prisma, logAudit } from "@aegis/db";
import type { DSARStatus, DSARRequestType } from "@aegis/db";
import { assertTransition, isTerminal } from "./state-machine";
import { computeSlaDeadline, computeExtendedDeadline, slaState, statutoryWindow } from "./sla";

export type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

const actorFields = (actor: Actor) => ({
  actorId: actor.id,
  actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
});

function dsarAudit(organizationId: string, actor: Actor, action: string, requestId: string, before: unknown, after: unknown, metadata: Record<string, unknown> = {}) {
  return logAudit({
    organizationId,
    ...actorFields(actor),
    action,
    resourceType: "DataSubjectRequest",
    resourceId: requestId,
    beforeJson: (before ?? null) as never,
    afterJson: (after ?? null) as never,
    metadata: { source: "privacy", ...metadata } as never,
  });
}

// ── DTOs ─────────────────────────────────────────────────────────────

export interface DsarSummaryDTO {
  id: string;
  requestType: DSARRequestType;
  status: DSARStatus;
  jurisdiction: string;
  regime: string;
  requesterName: string;
  requesterEmail: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  verificationStatus: string;
  source: string;
  submittedAt: string;
  slaDeadline: string;
  effectiveDeadline: string;
  daysRemaining: number;
  slaUrgency: string;
  extended: boolean;
  holdConflictCount: number;
  reviewItemCount: number;
}

export interface DsarDetailDTO extends DsarSummaryDTO {
  requesterPersonId: string;
  relevanceCriteria: string | null;
  subjectSummary: string | null;
  verificationMethod: string | null;
  verifiedAt: string | null;
  holdConflictCheckedAt: string | null;
  holdConflictOverrideReason: string | null;
  deliveredAt: string | null;
  deliveryChannel: string | null;
  closureReason: string | null;
  completedAt: string | null;
}

type RequestRow = {
  id: string; requestType: DSARStatus | string; status: DSARStatus; jurisdiction: string;
  requesterPersonId: string; assignedToUserId: string | null; verificationStatus: string;
  source: string; submittedAt: Date; slaDeadline: Date; extendedDeadline: Date | null;
  holdConflictCount: number;
};

async function resolveUserNames(userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))] as string[];
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

function toSummary(
  r: RequestRow & { requestType: DSARRequestType; requesterPerson: { name: string; email: string | null } | null; _count?: { reviewItems: number } },
  handlerName: string | null,
  now: Date,
): DsarSummaryDTO {
  const sla = slaState({ slaDeadline: r.slaDeadline, extendedDeadline: r.extendedDeadline }, now);
  return {
    id: r.id,
    requestType: r.requestType,
    status: r.status,
    jurisdiction: r.jurisdiction,
    regime: statutoryWindow(r.jurisdiction).regime,
    requesterName: r.requesterPerson?.name ?? "Unknown",
    requesterEmail: r.requesterPerson?.email ?? null,
    assignedToUserId: r.assignedToUserId,
    assignedToName: handlerName,
    verificationStatus: r.verificationStatus,
    source: r.source,
    submittedAt: r.submittedAt.toISOString(),
    slaDeadline: r.slaDeadline.toISOString(),
    effectiveDeadline: sla.effectiveDeadline.toISOString(),
    daysRemaining: sla.daysRemaining,
    slaUrgency: sla.urgency,
    extended: sla.extended,
    holdConflictCount: r.holdConflictCount,
    reviewItemCount: r._count?.reviewItems ?? 0,
  };
}

// ── Create ───────────────────────────────────────────────────────────

export interface CreateDsarInput {
  requestType: DSARRequestType;
  jurisdiction: string;
  /** Existing DATA_SUBJECT person, or requester details to provision one. */
  requesterPersonId?: string | null;
  requesterName?: string | null;
  requesterEmail?: string | null;
  relevanceCriteria?: string | null;
  subjectSummary?: string | null;
  assignedToUserId?: string | null;
  source?: string; // "internal" | "portal"
}

/** Provision (or resolve) the DATA_SUBJECT person for a request. Creating a
 *  data subject on intake is the sanctioned registration flow — chain-sealed. */
async function resolveDataSubject(organizationId: string, input: CreateDsarInput, actor: Actor): Promise<string> {
  if (input.requesterPersonId) {
    const p = await prisma.person.findFirst({ where: { id: input.requesterPersonId, organizationId }, select: { id: true } });
    if (!p) throw new Error(`Person ${input.requesterPersonId} not found in this organization.`);
    return p.id;
  }
  const name = (input.requesterName || "").trim();
  const email = (input.requesterEmail || "").trim() || null;
  if (!name) throw new Error("A requester name or an existing requesterPersonId is required.");
  if (email) {
    const existing = await prisma.person.findFirst({ where: { organizationId, type: "DATA_SUBJECT", email }, select: { id: true } });
    if (existing) return existing.id;
  }
  const created = await prisma.person.create({
    data: { organizationId, type: "DATA_SUBJECT", name, email, metadata: { jurisdiction: input.jurisdiction, provisionedBy: "dsar-intake" } as never },
  });
  await dsarAudit(organizationId, actor, "privacy.dsar.subject_provisioned", created.id, null, { personId: created.id, name, email }, { personId: created.id });
  return created.id;
}

export async function createDsarRequest(organizationId: string, input: CreateDsarInput, actor: Actor): Promise<DsarDetailDTO> {
  if (!input.requestType) throw new Error("requestType is required");
  if (!input.jurisdiction?.trim()) throw new Error("jurisdiction is required");
  const requesterPersonId = await resolveDataSubject(organizationId, input, actor);
  const now = new Date();
  const slaDeadline = computeSlaDeadline(now, input.jurisdiction);

  const row = await prisma.dataSubjectRequest.create({
    data: {
      organizationId,
      requesterPersonId,
      requestType: input.requestType,
      jurisdiction: input.jurisdiction.trim(),
      status: "RECEIVED",
      slaDeadline,
      relevanceCriteria: input.relevanceCriteria ?? null,
      subjectSummary: input.subjectSummary ?? null,
      assignedToUserId: input.assignedToUserId ?? null,
      source: input.source === "portal" ? "portal" : "internal",
    },
  });

  await dsarAudit(organizationId, actor, "privacy.dsar.created", row.id, null, {
    requestType: row.requestType, jurisdiction: row.jurisdiction, slaDeadline: slaDeadline.toISOString(), source: row.source,
  }, { requestType: row.requestType });

  const detail = await getDsarDetail(organizationId, row.id);
  if (!detail) throw new Error("Failed to load created request");
  return detail;
}

// ── Reads ────────────────────────────────────────────────────────────

export interface ListDsarFilters {
  status?: DSARStatus;
  requestType?: DSARRequestType;
  assignedToUserId?: string;
  overdueOnly?: boolean;
}

export async function listDsarRequests(organizationId: string, filters: ListDsarFilters = {}): Promise<DsarSummaryDTO[]> {
  const now = new Date();
  const rows = await prisma.dataSubjectRequest.findMany({
    where: {
      organizationId,
      ...(filters.status && { status: filters.status }),
      ...(filters.requestType && { requestType: filters.requestType }),
      ...(filters.assignedToUserId && { assignedToUserId: filters.assignedToUserId }),
    },
    include: { requesterPerson: { select: { name: true, email: true } }, _count: { select: { reviewItems: true } } },
    orderBy: [{ slaDeadline: "asc" }],
  });
  const names = await resolveUserNames(rows.map((r) => r.assignedToUserId).filter((x): x is string => !!x));
  let out = rows.map((r) => toSummary(r as never, r.assignedToUserId ? names.get(r.assignedToUserId) ?? null : null, now));
  if (filters.overdueOnly) out = out.filter((r) => r.slaUrgency === "BREACHED");
  return out;
}

export async function getDsarDetail(organizationId: string, requestId: string): Promise<DsarDetailDTO | null> {
  const now = new Date();
  const r = await prisma.dataSubjectRequest.findFirst({
    where: { id: requestId, organizationId },
    include: { requesterPerson: { select: { name: true, email: true } }, _count: { select: { reviewItems: true } } },
  });
  if (!r) return null;
  const names = await resolveUserNames(r.assignedToUserId ? [r.assignedToUserId] : []);
  const summary = toSummary(r as never, r.assignedToUserId ? names.get(r.assignedToUserId) ?? null : null, now);
  return {
    ...summary,
    requesterPersonId: r.requesterPersonId,
    relevanceCriteria: r.relevanceCriteria,
    subjectSummary: r.subjectSummary,
    verificationMethod: r.verificationMethod,
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
    holdConflictCheckedAt: r.holdConflictCheckedAt?.toISOString() ?? null,
    holdConflictOverrideReason: r.holdConflictOverrideReason,
    deliveredAt: r.deliveredAt?.toISOString() ?? null,
    deliveryChannel: r.deliveryChannel,
    closureReason: r.closureReason,
    completedAt: r.completedAt?.toISOString() ?? null,
  };
}

// ── Mutations ────────────────────────────────────────────────────────

async function loadOrThrow(organizationId: string, requestId: string) {
  const r = await prisma.dataSubjectRequest.findFirst({ where: { id: requestId, organizationId } });
  if (!r) throw new Error("Request not found");
  return r;
}

export async function assignDsar(organizationId: string, requestId: string, userId: string | null, actor: Actor): Promise<DsarDetailDTO> {
  const before = await loadOrThrow(organizationId, requestId);
  if (userId) {
    const u = await prisma.user.findFirst({ where: { id: userId, organizationId }, select: { id: true } });
    if (!u) throw new Error("Handler not found in this organization");
  }
  await prisma.dataSubjectRequest.update({ where: { id: requestId }, data: { assignedToUserId: userId } });
  await dsarAudit(organizationId, actor, "privacy.dsar.assigned", requestId, { assignedToUserId: before.assignedToUserId }, { assignedToUserId: userId });
  return (await getDsarDetail(organizationId, requestId))!;
}

export interface UpdateDsarFieldsInput {
  relevanceCriteria?: string | null;
  subjectSummary?: string | null;
}

export async function updateDsarFields(organizationId: string, requestId: string, input: UpdateDsarFieldsInput, actor: Actor): Promise<DsarDetailDTO> {
  const before = await loadOrThrow(organizationId, requestId);
  const data: Record<string, unknown> = {};
  if (input.relevanceCriteria !== undefined) data.relevanceCriteria = input.relevanceCriteria;
  if (input.subjectSummary !== undefined) data.subjectSummary = input.subjectSummary;
  if (Object.keys(data).length === 0) return (await getDsarDetail(organizationId, requestId))!;
  await prisma.dataSubjectRequest.update({ where: { id: requestId }, data: data as never });
  await dsarAudit(organizationId, actor, "privacy.dsar.updated", requestId, { relevanceCriteria: before.relevanceCriteria, subjectSummary: before.subjectSummary }, data);
  return (await getDsarDetail(organizationId, requestId))!;
}

export class DsarErasureHoldConflictError extends Error {
  constructor(public holdCount: number) {
    super(`Cannot fulfil an erasure request: ${holdCount} active legal hold(s) preserve this data subject's data. Resolve or override first.`);
    this.name = "DsarErasureHoldConflictError";
  }
}

export interface TransitionDsarInput {
  toStatus: DSARStatus;
  reason?: string | null;
}

/**
 * Drive the case to a new status with the state-machine guard plus semantic
 * guards: leaving VERIFYING for work requires a VERIFIED identity; reaching
 * FULFILLED on an ERASURE requires no unresolved legal-hold conflict.
 */
export async function transitionDsar(organizationId: string, requestId: string, input: TransitionDsarInput, actor: Actor): Promise<DsarDetailDTO> {
  const before = await loadOrThrow(organizationId, requestId);
  const from = before.status;
  const to = input.toStatus;
  if (from === to) return (await getDsarDetail(organizationId, requestId))!;
  if (isTerminal(from)) throw new Error(`Request is ${from} and cannot change state.`);
  assertTransition(from, to);

  if (to === "IN_PROGRESS" && from === "VERIFYING" && before.verificationStatus !== "VERIFIED") {
    throw new Error("Verify the requester's identity before starting collection.");
  }
  if (to === "FULFILLED" && before.requestType === "ERASURE") {
    if (before.holdConflictCount > 0 && !before.holdConflictOverrideReason) {
      throw new DsarErasureHoldConflictError(before.holdConflictCount);
    }
  }

  const now = new Date();
  const data: Record<string, unknown> = { status: to };
  if (to === "REJECTED" || to === "WITHDRAWN") data.closureReason = input.reason ?? null;
  if (isTerminal(to)) data.completedAt = now;

  await prisma.dataSubjectRequest.update({ where: { id: requestId }, data: data as never });
  await dsarAudit(organizationId, actor, "privacy.dsar.status_changed", requestId, { status: from }, { status: to, reason: input.reason ?? null }, { from, to });
  return (await getDsarDetail(organizationId, requestId))!;
}

/** Hard-delete a request and everything under it (review items, data
 *  locations, access tokens cascade via FK). For demo cleanup. Chain-sealed. */
export async function deleteDsarRequest(organizationId: string, requestId: string, actor: Actor): Promise<{ ok: true }> {
  const before = await loadOrThrow(organizationId, requestId);
  await prisma.dataSubjectRequest.delete({ where: { id: requestId } });
  await dsarAudit(organizationId, actor, "privacy.dsar.deleted", requestId, { requestType: before.requestType, status: before.status }, null, { requestType: before.requestType });
  return { ok: true };
}

/**
 * Reset a request to a clean pre-collection state — clears collected review
 * items, data locations, access tokens, verification, and delivery, and
 * returns the case to RECEIVED. Keeps the request + data subject so the demo
 * can be re-run against the same person. Chain-sealed.
 */
export async function resetDsarRequest(organizationId: string, requestId: string, actor: Actor): Promise<DsarDetailDTO> {
  const before = await loadOrThrow(organizationId, requestId);
  await prisma.$transaction([
    prisma.dSARReviewItem.deleteMany({ where: { requestId } }),
    prisma.dSARDataLocation.deleteMany({ where: { requestId } }),
    prisma.dSARAccessToken.deleteMany({ where: { requestId } }),
    prisma.dataSubjectRequest.update({
      where: { id: requestId },
      data: {
        status: "RECEIVED",
        verificationStatus: "UNVERIFIED",
        verifiedAt: null,
        verificationMethod: null,
        completedAt: null,
        deliveredAt: null,
        deliveryChannel: null,
        response: undefined,
        closureReason: null,
        extendedDeadline: null,
        holdConflictCheckedAt: null,
        holdConflictCount: 0,
        holdConflictOverrideReason: null,
      },
    }),
  ]);
  await dsarAudit(organizationId, actor, "privacy.dsar.reset", requestId, { status: before.status }, { status: "RECEIVED" }, { requestType: before.requestType });
  return (await getDsarDetail(organizationId, requestId))!;
}

export async function extendDsarDeadline(organizationId: string, requestId: string, input: { reason?: string | null }, actor: Actor): Promise<DsarDetailDTO> {
  const before = await loadOrThrow(organizationId, requestId);
  if (before.extendedDeadline) throw new Error("This request's deadline has already been extended once.");
  const extended = computeExtendedDeadline(before.slaDeadline, before.jurisdiction);
  await prisma.dataSubjectRequest.update({ where: { id: requestId }, data: { extendedDeadline: extended } });
  await dsarAudit(organizationId, actor, "privacy.dsar.deadline_extended", requestId, { slaDeadline: before.slaDeadline.toISOString() }, { extendedDeadline: extended.toISOString(), reason: input.reason ?? null });
  return (await getDsarDetail(organizationId, requestId))!;
}
