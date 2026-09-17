/**
 * Privacy program completion (module #10): processor / sub-processor register
 * (#12), cookie & tracker registry (#14), and privacy training & awareness
 * tracker (#15). Server-only, chain-sealed CRUD over the three new tables.
 *
 * Scope note: the registries are the real data model. The *scanning* that
 * auto-populates cookies (a browser SDK) and the *content delivery* behind
 * training (an LMS) are external surfaces — out of scope here by design.
 */
import { prisma, logAudit } from "@aegis/db";

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);
const intOrNull = (v: unknown): number | null => (v === undefined || v === null || v === "" ? null : Math.max(0, Math.floor(Number(v) || 0)));

/* ── Processor / sub-processor register (#12) ────────────────────────────── */

export interface ProcessorDTO {
  id: string; name: string; role: string; purpose: string | null; location: string | null;
  dpaStatus: string; riskTier: string; safeguards: string | null; contactEmail: string | null;
  subProcessors: string[]; notes: string | null; active: boolean; createdAt: string; updatedAt: string;
}
const ROLES = new Set(["CONTROLLER", "PROCESSOR", "SUB_PROCESSOR", "JOINT_CONTROLLER"]);
const DPA_STATUS = new Set(["NONE", "REQUESTED", "SIGNED", "EXPIRED"]);
const P_TIERS = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export async function listProcessors(organizationId: string): Promise<ProcessorDTO[]> {
  const rows = await prisma.privacyProcessor.findMany({ where: { organizationId }, orderBy: [{ name: "asc" }] });
  return rows.map((r) => ({
    id: r.id, name: r.name, role: r.role, purpose: r.purpose, location: r.location,
    dpaStatus: r.dpaStatus, riskTier: r.riskTier, safeguards: r.safeguards, contactEmail: r.contactEmail,
    subProcessors: arr(r.subProcessors), notes: r.notes, active: r.active,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function upsertProcessor(organizationId: string, id: string | null, input: Record<string, unknown>, actorId: string | null): Promise<{ id: string }> {
  const name = String(input.name || "").trim().slice(0, 200);
  if (!name) throw new Error("A name is required");
  const role = String(input.role || "PROCESSOR").toUpperCase();
  const dpaStatus = String(input.dpaStatus || "NONE").toUpperCase();
  const riskTier = String(input.riskTier || "MEDIUM").toUpperCase();
  if (!ROLES.has(role)) throw new Error("bad role");
  if (!DPA_STATUS.has(dpaStatus)) throw new Error("bad dpaStatus");
  if (!P_TIERS.has(riskTier)) throw new Error("bad riskTier");
  const data = {
    name, role: role as never, purpose: input.purpose ? String(input.purpose).slice(0, 500) : null,
    location: input.location ? String(input.location).slice(0, 120) : null,
    dpaStatus: dpaStatus as never, riskTier: riskTier as never,
    safeguards: input.safeguards ? String(input.safeguards).slice(0, 1000) : null,
    contactEmail: input.contactEmail ? String(input.contactEmail).slice(0, 200) : null,
    subProcessors: arr(input.subProcessors) as never,
    notes: input.notes ? String(input.notes).slice(0, 1000) : null,
    active: input.active === undefined ? true : !!input.active,
  };
  let row;
  if (id) { const ex = await prisma.privacyProcessor.findFirst({ where: { id, organizationId } }); if (!ex) throw new Error("Not found"); row = await prisma.privacyProcessor.update({ where: { id }, data }); }
  else row = await prisma.privacyProcessor.create({ data: { organizationId, ...data } });
  await logAudit({ organizationId, actorId, actorType: actorId ? "USER" : "SYSTEM", action: id ? "privacy.processor.updated" : "privacy.processor.created", resourceType: "PrivacyProcessor", resourceId: row.id, afterJson: { name, role, riskTier } as never, metadata: { source: "privacy-program" } as never });
  return { id: row.id };
}

export async function deleteProcessor(organizationId: string, id: string, actorId: string): Promise<void> {
  const ex = await prisma.privacyProcessor.findFirst({ where: { id, organizationId } });
  if (!ex) throw new Error("Not found");
  await prisma.privacyProcessor.delete({ where: { id } });
  await logAudit({ organizationId, actorId, actorType: "USER", action: "privacy.processor.deleted", resourceType: "PrivacyProcessor", resourceId: id, beforeJson: { name: ex.name } as never, metadata: { source: "privacy-program" } as never });
}

/* ── Cookie & tracker registry (#14) ─────────────────────────────────────── */

export interface CookieDTO {
  id: string; name: string; category: string; provider: string | null; purpose: string | null;
  domain: string | null; durationDays: number | null; consentRequired: boolean; active: boolean;
  createdAt: string; updatedAt: string;
}
const COOKIE_CATS = new Set(["STRICTLY_NECESSARY", "FUNCTIONAL", "ANALYTICS", "MARKETING"]);

export async function listCookies(organizationId: string): Promise<CookieDTO[]> {
  const rows = await prisma.cookieRecord.findMany({ where: { organizationId }, orderBy: [{ category: "asc" }, { name: "asc" }] });
  return rows.map((r) => ({
    id: r.id, name: r.name, category: r.category, provider: r.provider, purpose: r.purpose,
    domain: r.domain, durationDays: r.durationDays, consentRequired: r.consentRequired, active: r.active,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function upsertCookie(organizationId: string, id: string | null, input: Record<string, unknown>, actorId: string | null): Promise<{ id: string }> {
  const name = String(input.name || "").trim().slice(0, 200);
  if (!name) throw new Error("A name is required");
  const category = String(input.category || "FUNCTIONAL").toUpperCase();
  if (!COOKIE_CATS.has(category)) throw new Error("bad category");
  const data = {
    name, category: category as never, provider: input.provider ? String(input.provider).slice(0, 200) : null,
    purpose: input.purpose ? String(input.purpose).slice(0, 500) : null,
    domain: input.domain ? String(input.domain).slice(0, 200) : null,
    durationDays: intOrNull(input.durationDays),
    consentRequired: input.consentRequired === undefined ? category !== "STRICTLY_NECESSARY" : !!input.consentRequired,
    active: input.active === undefined ? true : !!input.active,
  };
  let row;
  if (id) { const ex = await prisma.cookieRecord.findFirst({ where: { id, organizationId } }); if (!ex) throw new Error("Not found"); row = await prisma.cookieRecord.update({ where: { id }, data }); }
  else row = await prisma.cookieRecord.create({ data: { organizationId, ...data } });
  await logAudit({ organizationId, actorId, actorType: actorId ? "USER" : "SYSTEM", action: id ? "privacy.cookie.updated" : "privacy.cookie.created", resourceType: "CookieRecord", resourceId: row.id, afterJson: { name, category } as never, metadata: { source: "privacy-program" } as never });
  return { id: row.id };
}

export async function deleteCookie(organizationId: string, id: string, actorId: string): Promise<void> {
  const ex = await prisma.cookieRecord.findFirst({ where: { id, organizationId } });
  if (!ex) throw new Error("Not found");
  await prisma.cookieRecord.delete({ where: { id } });
  await logAudit({ organizationId, actorId, actorType: "USER", action: "privacy.cookie.deleted", resourceType: "CookieRecord", resourceId: id, beforeJson: { name: ex.name } as never, metadata: { source: "privacy-program" } as never });
}

/* ── Training & awareness tracker (#15) ──────────────────────────────────── */

export interface TrainingDTO {
  id: string; courseName: string; audience: string | null; cadence: string; status: string;
  assignedCount: number; completedCount: number; dueDate: string | null; notes: string | null;
  createdAt: string; updatedAt: string;
}
const CADENCES = new Set(["ONBOARDING", "ANNUAL", "QUARTERLY", "AD_HOC"]);
const T_STATUS = new Set(["DRAFT", "ACTIVE", "COMPLETED", "OVERDUE"]);

export async function listTrainings(organizationId: string): Promise<TrainingDTO[]> {
  const rows = await prisma.privacyTrainingRecord.findMany({ where: { organizationId }, orderBy: [{ createdAt: "desc" }] });
  return rows.map((r) => ({
    id: r.id, courseName: r.courseName, audience: r.audience, cadence: r.cadence, status: r.status,
    assignedCount: r.assignedCount, completedCount: r.completedCount,
    dueDate: r.dueDate ? r.dueDate.toISOString() : null, notes: r.notes,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function upsertTraining(organizationId: string, id: string | null, input: Record<string, unknown>, actorId: string | null): Promise<{ id: string }> {
  const courseName = String(input.courseName || "").trim().slice(0, 200);
  if (!courseName) throw new Error("A course name is required");
  const cadence = String(input.cadence || "ANNUAL").toUpperCase();
  const status = String(input.status || "DRAFT").toUpperCase();
  if (!CADENCES.has(cadence)) throw new Error("bad cadence");
  if (!T_STATUS.has(status)) throw new Error("bad status");
  const assignedCount = intOrNull(input.assignedCount) ?? 0;
  const completedCount = Math.min(intOrNull(input.completedCount) ?? 0, assignedCount);
  const data = {
    courseName, audience: input.audience ? String(input.audience).slice(0, 200) : null,
    cadence: cadence as never, status: status as never, assignedCount, completedCount,
    dueDate: input.dueDate ? new Date(String(input.dueDate)) : null,
    notes: input.notes ? String(input.notes).slice(0, 1000) : null,
  };
  let row;
  if (id) { const ex = await prisma.privacyTrainingRecord.findFirst({ where: { id, organizationId } }); if (!ex) throw new Error("Not found"); row = await prisma.privacyTrainingRecord.update({ where: { id }, data }); }
  else row = await prisma.privacyTrainingRecord.create({ data: { organizationId, ...data } });
  await logAudit({ organizationId, actorId, actorType: actorId ? "USER" : "SYSTEM", action: id ? "privacy.training.updated" : "privacy.training.created", resourceType: "PrivacyTrainingRecord", resourceId: row.id, afterJson: { courseName, status } as never, metadata: { source: "privacy-program" } as never });
  return { id: row.id };
}

export async function deleteTraining(organizationId: string, id: string, actorId: string): Promise<void> {
  const ex = await prisma.privacyTrainingRecord.findFirst({ where: { id, organizationId } });
  if (!ex) throw new Error("Not found");
  await prisma.privacyTrainingRecord.delete({ where: { id } });
  await logAudit({ organizationId, actorId, actorType: "USER", action: "privacy.training.deleted", resourceType: "PrivacyTrainingRecord", resourceId: id, beforeJson: { courseName: ex.courseName } as never, metadata: { source: "privacy-program" } as never });
}
