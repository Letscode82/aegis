/**
 * Privacy records completion (module #10): retention schedules, cross-border
 * transfer register, and the AI-system inventory. Server-only, chain-sealed
 * CRUD over the three new tables. Each is a lean records surface that plugs
 * into the Privacy hub alongside RoPA / Consent / Incidents.
 */
import { prisma, logAudit } from "@aegis/db";

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);

/* ── Retention schedules ─────────────────────────────────────────────── */

export interface RetentionDTO {
  id: string; name: string; dataCategory: string; retentionPeriodDays: number;
  action: string; trigger: string | null; appliesTo: string[]; notes: string | null; active: boolean;
  createdAt: string; updatedAt: string;
}
const RET_ACTIONS = new Set(["DELETE", "ANONYMIZE", "REVIEW"]);

export async function listRetention(organizationId: string): Promise<RetentionDTO[]> {
  const rows = await prisma.retentionSchedule.findMany({ where: { organizationId }, orderBy: [{ name: "asc" }] });
  return rows.map((r) => ({
    id: r.id, name: r.name, dataCategory: r.dataCategory, retentionPeriodDays: r.retentionPeriodDays,
    action: r.action, trigger: r.trigger, appliesTo: arr(r.appliesTo), notes: r.notes, active: r.active,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function upsertRetention(organizationId: string, id: string | null, input: Record<string, unknown>, actorId: string | null): Promise<{ id: string }> {
  const name = String(input.name || "").trim().slice(0, 200);
  if (!name) throw new Error("A name is required");
  const action = String(input.action || "DELETE").toUpperCase();
  if (!RET_ACTIONS.has(action)) throw new Error("bad action");
  const data = {
    name, dataCategory: String(input.dataCategory || "").slice(0, 200),
    retentionPeriodDays: Math.max(0, Math.floor(Number(input.retentionPeriodDays) || 0)),
    action: action as never, trigger: input.trigger ? String(input.trigger).slice(0, 200) : null,
    appliesTo: arr(input.appliesTo) as never, notes: input.notes ? String(input.notes).slice(0, 1000) : null,
    active: input.active === undefined ? true : !!input.active,
  };
  let row;
  if (id) { const ex = await prisma.retentionSchedule.findFirst({ where: { id, organizationId } }); if (!ex) throw new Error("Not found"); row = await prisma.retentionSchedule.update({ where: { id }, data }); }
  else row = await prisma.retentionSchedule.create({ data: { organizationId, ...data } });
  await logAudit({ organizationId, actorId, actorType: actorId ? "USER" : "SYSTEM", action: id ? "privacy.retention.updated" : "privacy.retention.created", resourceType: "RetentionSchedule", resourceId: row.id, afterJson: { name } as never, metadata: { source: "privacy-records" } as never });
  return { id: row.id };
}

export async function deleteRetention(organizationId: string, id: string, actorId: string): Promise<void> {
  const ex = await prisma.retentionSchedule.findFirst({ where: { id, organizationId } });
  if (!ex) throw new Error("Not found");
  await prisma.retentionSchedule.delete({ where: { id } });
  await logAudit({ organizationId, actorId, actorType: "USER", action: "privacy.retention.deleted", resourceType: "RetentionSchedule", resourceId: id, beforeJson: { name: ex.name } as never, metadata: { source: "privacy-records" } as never });
}

/* ── Cross-border transfers ──────────────────────────────────────────── */

export interface TransferDTO {
  id: string; name: string; destinationCountry: string; mechanism: string; status: string;
  safeguards: string | null; tiaAssessmentId: string | null; notes: string | null; createdAt: string; updatedAt: string;
}
const MECHS = new Set(["SCC", "ADEQUACY", "BCR", "DEROGATION", "NONE"]);
const TSTATUS = new Set(["ACTIVE", "UNDER_REVIEW", "SUSPENDED"]);

export async function listTransfers(organizationId: string): Promise<TransferDTO[]> {
  const rows = await prisma.dataTransfer.findMany({ where: { organizationId }, orderBy: [{ name: "asc" }] });
  return rows.map((r) => ({
    id: r.id, name: r.name, destinationCountry: r.destinationCountry, mechanism: r.mechanism, status: r.status,
    safeguards: r.safeguards, tiaAssessmentId: r.tiaAssessmentId, notes: r.notes,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function upsertTransfer(organizationId: string, id: string | null, input: Record<string, unknown>, actorId: string | null): Promise<{ id: string }> {
  const name = String(input.name || "").trim().slice(0, 200);
  if (!name) throw new Error("A name is required");
  const mechanism = String(input.mechanism || "NONE").toUpperCase();
  const status = String(input.status || "ACTIVE").toUpperCase();
  if (!MECHS.has(mechanism)) throw new Error("bad mechanism");
  if (!TSTATUS.has(status)) throw new Error("bad status");
  const data = {
    name, destinationCountry: String(input.destinationCountry || "").slice(0, 120),
    mechanism: mechanism as never, status: status as never,
    safeguards: input.safeguards ? String(input.safeguards).slice(0, 1000) : null,
    tiaAssessmentId: input.tiaAssessmentId ? String(input.tiaAssessmentId) : null,
    notes: input.notes ? String(input.notes).slice(0, 1000) : null,
  };
  let row;
  if (id) { const ex = await prisma.dataTransfer.findFirst({ where: { id, organizationId } }); if (!ex) throw new Error("Not found"); row = await prisma.dataTransfer.update({ where: { id }, data }); }
  else row = await prisma.dataTransfer.create({ data: { organizationId, ...data } });
  await logAudit({ organizationId, actorId, actorType: actorId ? "USER" : "SYSTEM", action: id ? "privacy.transfer.updated" : "privacy.transfer.created", resourceType: "DataTransfer", resourceId: row.id, afterJson: { name, mechanism, status } as never, metadata: { source: "privacy-records" } as never });
  return { id: row.id };
}

export async function deleteTransfer(organizationId: string, id: string, actorId: string): Promise<void> {
  const ex = await prisma.dataTransfer.findFirst({ where: { id, organizationId } });
  if (!ex) throw new Error("Not found");
  await prisma.dataTransfer.delete({ where: { id } });
  await logAudit({ organizationId, actorId, actorType: "USER", action: "privacy.transfer.deleted", resourceType: "DataTransfer", resourceId: id, beforeJson: { name: ex.name } as never, metadata: { source: "privacy-records" } as never });
}

/* ── AI-system inventory ─────────────────────────────────────────────── */

export interface AiSystemDTO {
  id: string; name: string; purpose: string | null; riskTier: string; status: string;
  humanOversight: boolean; owner: string | null; assessmentId: string | null; notes: string | null; createdAt: string; updatedAt: string;
}
const TIERS = new Set(["MINIMAL", "LIMITED", "HIGH", "UNACCEPTABLE"]);
const AISTATUS = new Set(["PILOT", "IN_USE", "RETIRED"]);

export async function listAiSystems(organizationId: string): Promise<AiSystemDTO[]> {
  const rows = await prisma.aiSystem.findMany({ where: { organizationId }, orderBy: [{ name: "asc" }] });
  return rows.map((r) => ({
    id: r.id, name: r.name, purpose: r.purpose, riskTier: r.riskTier, status: r.status,
    humanOversight: r.humanOversight, owner: r.owner, assessmentId: r.assessmentId, notes: r.notes,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function upsertAiSystem(organizationId: string, id: string | null, input: Record<string, unknown>, actorId: string | null): Promise<{ id: string }> {
  const name = String(input.name || "").trim().slice(0, 200);
  if (!name) throw new Error("A name is required");
  const riskTier = String(input.riskTier || "LIMITED").toUpperCase();
  const status = String(input.status || "PILOT").toUpperCase();
  if (!TIERS.has(riskTier)) throw new Error("bad riskTier");
  if (!AISTATUS.has(status)) throw new Error("bad status");
  const data = {
    name, purpose: input.purpose ? String(input.purpose).slice(0, 500) : null,
    riskTier: riskTier as never, status: status as never,
    humanOversight: input.humanOversight === undefined ? true : !!input.humanOversight,
    owner: input.owner ? String(input.owner).slice(0, 200) : null,
    assessmentId: input.assessmentId ? String(input.assessmentId) : null,
    notes: input.notes ? String(input.notes).slice(0, 1000) : null,
  };
  let row;
  if (id) { const ex = await prisma.aiSystem.findFirst({ where: { id, organizationId } }); if (!ex) throw new Error("Not found"); row = await prisma.aiSystem.update({ where: { id }, data }); }
  else row = await prisma.aiSystem.create({ data: { organizationId, ...data } });
  await logAudit({ organizationId, actorId, actorType: actorId ? "USER" : "SYSTEM", action: id ? "privacy.aisystem.updated" : "privacy.aisystem.created", resourceType: "AiSystem", resourceId: row.id, afterJson: { name, riskTier, status } as never, metadata: { source: "privacy-records" } as never });
  return { id: row.id };
}

export async function deleteAiSystem(organizationId: string, id: string, actorId: string): Promise<void> {
  const ex = await prisma.aiSystem.findFirst({ where: { id, organizationId } });
  if (!ex) throw new Error("Not found");
  await prisma.aiSystem.delete({ where: { id } });
  await logAudit({ organizationId, actorId, actorType: "USER", action: "privacy.aisystem.deleted", resourceType: "AiSystem", resourceId: id, beforeJson: { name: ex.name } as never, metadata: { source: "privacy-records" } as never });
}
