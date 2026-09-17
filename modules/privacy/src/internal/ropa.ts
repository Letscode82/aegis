/**
 * Records of Processing Activities (RoPA / Art. 30) — the data map.
 * Server-only, chain-sealed. CRUD over the existing DataProcessingActivity
 * model (the same records that seed the DSAR data-location checklist — the
 * "one brain" join). No new table.
 */
import { prisma, logAudit } from "@aegis/db";

export interface RopaDTO {
  id: string;
  name: string;
  lawfulBasis: string;
  retentionPeriodDays: number;
  dataTypes: string[];
  dataSubjectCategories: string[];
  systems: string[];
  transferredCountries: string[];
  createdAt: string;
  updatedAt: string;
}

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);

interface RopaRow {
  id: string; name: string; lawfulBasis: string; retentionPeriodDays: number;
  dataTypes: unknown; dataSubjectCategories: unknown; systems: unknown; transferredCountries: unknown;
  createdAt: Date; updatedAt: Date;
}
function toDTO(r: RopaRow): RopaDTO {
  return {
    id: r.id, name: r.name, lawfulBasis: r.lawfulBasis, retentionPeriodDays: r.retentionPeriodDays,
    dataTypes: arr(r.dataTypes), dataSubjectCategories: arr(r.dataSubjectCategories),
    systems: arr(r.systems), transferredCountries: arr(r.transferredCountries),
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

export async function listRopa(organizationId: string): Promise<RopaDTO[]> {
  const rows = await prisma.dataProcessingActivity.findMany({ where: { organizationId }, orderBy: [{ name: "asc" }] });
  return rows.map((r) => toDTO(r as RopaRow));
}

export async function getRopa(organizationId: string, id: string): Promise<RopaDTO | null> {
  const r = await prisma.dataProcessingActivity.findFirst({ where: { id, organizationId } });
  return r ? toDTO(r as RopaRow) : null;
}

export interface RopaInput {
  name: string;
  lawfulBasis?: string;
  retentionPeriodDays?: number;
  dataTypes?: string[];
  dataSubjectCategories?: string[];
  systems?: string[];
  transferredCountries?: string[];
}

export async function createRopa(organizationId: string, input: RopaInput, actorId: string | null): Promise<RopaDTO> {
  const name = String(input.name || "").trim().slice(0, 200);
  if (!name) throw new Error("A processing-activity name is required");
  const dupe = await prisma.dataProcessingActivity.findFirst({ where: { organizationId, name } });
  if (dupe) throw new Error(`A processing activity named "${name}" already exists.`);
  const created = await prisma.dataProcessingActivity.create({
    data: {
      organizationId, name,
      lawfulBasis: String(input.lawfulBasis || "").slice(0, 200),
      retentionPeriodDays: Math.max(0, Math.floor(Number(input.retentionPeriodDays) || 0)),
      dataTypes: arr(input.dataTypes) as never,
      dataSubjectCategories: arr(input.dataSubjectCategories) as never,
      systems: arr(input.systems) as never,
      transferredCountries: arr(input.transferredCountries) as never,
    },
  });
  await logAudit({
    organizationId, actorId, actorType: actorId ? "USER" : "SYSTEM",
    action: "privacy.ropa.created", resourceType: "DataProcessingActivity", resourceId: created.id,
    afterJson: { name } as never, metadata: { source: "privacy-ropa" } as never,
  });
  return toDTO(created as RopaRow);
}

export async function updateRopa(organizationId: string, id: string, patch: Partial<RopaInput>, actorId: string | null): Promise<RopaDTO> {
  const existing = await prisma.dataProcessingActivity.findFirst({ where: { id, organizationId } });
  if (!existing) throw new Error("Processing activity not found");
  const data: Record<string, unknown> = {};
  if (patch.name != null) {
    const name = String(patch.name).trim().slice(0, 200);
    if (name && name !== existing.name) {
      const dupe = await prisma.dataProcessingActivity.findFirst({ where: { organizationId, name, id: { not: id } } });
      if (dupe) throw new Error(`A processing activity named "${name}" already exists.`);
      data.name = name;
    }
  }
  if (patch.lawfulBasis != null) data.lawfulBasis = String(patch.lawfulBasis).slice(0, 200);
  if (patch.retentionPeriodDays != null) data.retentionPeriodDays = Math.max(0, Math.floor(Number(patch.retentionPeriodDays) || 0));
  if (patch.dataTypes != null) data.dataTypes = arr(patch.dataTypes) as never;
  if (patch.dataSubjectCategories != null) data.dataSubjectCategories = arr(patch.dataSubjectCategories) as never;
  if (patch.systems != null) data.systems = arr(patch.systems) as never;
  if (patch.transferredCountries != null) data.transferredCountries = arr(patch.transferredCountries) as never;

  const updated = await prisma.dataProcessingActivity.update({ where: { id }, data });
  await logAudit({
    organizationId, actorId, actorType: actorId ? "USER" : "SYSTEM",
    action: "privacy.ropa.updated", resourceType: "DataProcessingActivity", resourceId: id,
    afterJson: { name: updated.name } as never, metadata: { source: "privacy-ropa" } as never,
  });
  return toDTO(updated as RopaRow);
}

export async function deleteRopa(organizationId: string, id: string, actorId: string): Promise<void> {
  const existing = await prisma.dataProcessingActivity.findFirst({ where: { id, organizationId } });
  if (!existing) throw new Error("Processing activity not found");
  await prisma.dataProcessingActivity.delete({ where: { id } });
  await logAudit({
    organizationId, actorId, actorType: "USER",
    action: "privacy.ropa.deleted", resourceType: "DataProcessingActivity", resourceId: id,
    beforeJson: { name: existing.name } as never, metadata: { source: "privacy-ropa" } as never,
  });
}
