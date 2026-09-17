/**
 * Privacy incidents & breach management (module #10). Server-only,
 * chain-sealed. CRUD over the existing PrivacyIncident model plus the
 * GDPR 72-hour regulator-notification clock (computed from discoveredAt).
 * No new table. This is the home for incident/breach response — distinct
 * from the proactive Assessments surface.
 */
import { prisma, logAudit } from "@aegis/db";

/** GDPR Art. 33: notify the supervisory authority within 72h of awareness. */
export const BREACH_NOTIFY_HOURS = 72;

export interface IncidentClock {
  deadline: string;          // discoveredAt + 72h
  notified: boolean;
  breached: boolean;         // past deadline and not yet notified
  hoursRemaining: number | null; // null once notified
}

export function computeClock(discoveredAt: Date, regulatorNotified: boolean, now: Date = new Date()): IncidentClock {
  const deadlineMs = discoveredAt.getTime() + BREACH_NOTIFY_HOURS * 3_600_000;
  const deadline = new Date(deadlineMs).toISOString();
  if (regulatorNotified) return { deadline, notified: true, breached: false, hoursRemaining: null };
  const hoursRemaining = Math.round(((deadlineMs - now.getTime()) / 3_600_000) * 10) / 10;
  return { deadline, notified: false, breached: now.getTime() > deadlineMs, hoursRemaining };
}

export interface IncidentDTO {
  id: string;
  severity: string;
  status: string;
  discoveredAt: string;
  reportedAt: string | null;
  affectedRecordsCount: number;
  regulatorNotified: boolean;
  mitigationSteps: string[];
  description: string | null;
  clock: IncidentClock;
  createdAt: string;
  updatedAt: string;
}

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);

interface IncidentRow {
  id: string; severity: string; status: string; discoveredAt: Date; reportedAt: Date | null;
  affectedRecordsCount: number; regulatorNotified: boolean; mitigationSteps: unknown;
  description: string | null; createdAt: Date; updatedAt: Date;
}
function toDTO(r: IncidentRow): IncidentDTO {
  return {
    id: r.id, severity: r.severity, status: r.status,
    discoveredAt: r.discoveredAt.toISOString(), reportedAt: r.reportedAt ? r.reportedAt.toISOString() : null,
    affectedRecordsCount: r.affectedRecordsCount, regulatorNotified: r.regulatorNotified,
    mitigationSteps: arr(r.mitigationSteps), description: r.description,
    clock: computeClock(r.discoveredAt, r.regulatorNotified),
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

const SEVERITY = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const STATUS = new Set(["REPORTED", "INVESTIGATING", "CONTAINED", "RESOLVED"]);

export async function listIncidents(organizationId: string): Promise<IncidentDTO[]> {
  const rows = await prisma.privacyIncident.findMany({ where: { organizationId }, orderBy: [{ discoveredAt: "desc" }] });
  return rows.map((r) => toDTO(r as IncidentRow));
}

export async function getIncident(organizationId: string, id: string): Promise<IncidentDTO | null> {
  const r = await prisma.privacyIncident.findFirst({ where: { id, organizationId } });
  return r ? toDTO(r as IncidentRow) : null;
}

export interface IncidentInput {
  severity: string;
  discoveredAt?: string;
  description?: string;
  affectedRecordsCount?: number;
}

export async function createIncident(organizationId: string, input: IncidentInput, actorId: string | null): Promise<IncidentDTO> {
  const severity = String(input.severity || "").toUpperCase();
  if (!SEVERITY.has(severity)) throw new Error(`severity must be one of ${[...SEVERITY].join(", ")}`);
  let discoveredAt = new Date();
  if (input.discoveredAt) { const d = new Date(input.discoveredAt); if (!Number.isNaN(d.getTime())) discoveredAt = d; }
  const created = await prisma.privacyIncident.create({
    data: {
      organizationId, severity: severity as never, discoveredAt,
      description: input.description ? String(input.description).slice(0, 2000) : null,
      affectedRecordsCount: Math.max(0, Math.floor(Number(input.affectedRecordsCount) || 0)),
      status: "REPORTED",
    },
  });
  await logAudit({
    organizationId, actorId, actorType: actorId ? "USER" : "SYSTEM",
    action: "privacy.incident.created", resourceType: "PrivacyIncident", resourceId: created.id,
    afterJson: { severity, discoveredAt: discoveredAt.toISOString() } as never, metadata: { source: "privacy-incidents" } as never,
  });
  return toDTO(created as IncidentRow);
}

export async function updateIncident(
  organizationId: string, id: string,
  patch: { severity?: string; status?: string; description?: string; affectedRecordsCount?: number; mitigationSteps?: string[] },
  actorId: string | null,
): Promise<IncidentDTO> {
  const existing = await prisma.privacyIncident.findFirst({ where: { id, organizationId } });
  if (!existing) throw new Error("Incident not found");
  const data: Record<string, unknown> = {};
  if (patch.severity != null) { const s = String(patch.severity).toUpperCase(); if (!SEVERITY.has(s)) throw new Error("bad severity"); data.severity = s; }
  if (patch.status != null) { const s = String(patch.status).toUpperCase(); if (!STATUS.has(s)) throw new Error("bad status"); data.status = s; }
  if (patch.description !== undefined) data.description = patch.description ? String(patch.description).slice(0, 2000) : null;
  if (patch.affectedRecordsCount != null) data.affectedRecordsCount = Math.max(0, Math.floor(Number(patch.affectedRecordsCount) || 0));
  if (patch.mitigationSteps != null) data.mitigationSteps = arr(patch.mitigationSteps).slice(0, 100) as never;
  const updated = await prisma.privacyIncident.update({ where: { id }, data });
  await logAudit({
    organizationId, actorId, actorType: actorId ? "USER" : "SYSTEM",
    action: "privacy.incident.updated", resourceType: "PrivacyIncident", resourceId: id,
    beforeJson: { status: existing.status, severity: existing.severity } as never,
    afterJson: { status: updated.status, severity: updated.severity } as never, metadata: { source: "privacy-incidents" } as never,
  });
  return toDTO(updated as IncidentRow);
}

/** Record regulator notification — stops the 72-hour clock. */
export async function markRegulatorNotified(organizationId: string, id: string, actorId: string): Promise<IncidentDTO> {
  const existing = await prisma.privacyIncident.findFirst({ where: { id, organizationId } });
  if (!existing) throw new Error("Incident not found");
  const now = new Date();
  const clockAtNotify = computeClock(existing.discoveredAt, false, now);
  const updated = await prisma.privacyIncident.update({
    where: { id }, data: { regulatorNotified: true, reportedAt: existing.reportedAt ?? now },
  });
  await logAudit({
    organizationId, actorId, actorType: "USER",
    action: "privacy.incident.regulator_notified", resourceType: "PrivacyIncident", resourceId: id,
    afterJson: { notifiedAt: now.toISOString(), withinDeadline: !clockAtNotify.breached, deadline: clockAtNotify.deadline } as never,
    metadata: { source: "privacy-incidents" } as never,
  });
  return toDTO(updated as IncidentRow);
}
