/**
 * Personal-data inventory (the "Collect" phase — "better visibility of the
 * personal data inventory"). Each DSARDataLocation is a system × data-type
 * cell the team confirms the subject's data is (or isn't) in, whether it needs
 * redaction, and when it was retrieved. The candidate set is seeded from the
 * org's ROPA (DataProcessingActivity.systems) so the checklist starts from the
 * systems we already declared we process data in — the "one brain" join
 * between the Article 30 record and the live request.
 */
import { prisma, logAudit } from "@aegis/db";
import { enumerateM365DataSourcesForUser, getM365ConnectionStatus, type EnumeratedDataSource } from "@aegis/matter";
import type { Actor } from "./requests";

export interface DataLocationDTO {
  id: string;
  system: string;
  dataType: string;
  found: boolean;
  redactionsRequired: boolean;
  retrievedAt: string | null;
}

function toDTO(r: { id: string; system: string; dataType: string; found: boolean; redactionsRequired: boolean; retrievedAt: Date | null }): DataLocationDTO {
  return { id: r.id, system: r.system, dataType: r.dataType, found: r.found, redactionsRequired: r.redactionsRequired, retrievedAt: r.retrievedAt?.toISOString() ?? null };
}

export async function listDataLocations(organizationId: string, requestId: string): Promise<DataLocationDTO[]> {
  const req = await prisma.dataSubjectRequest.findFirst({ where: { id: requestId, organizationId }, select: { id: true } });
  if (!req) throw new Error("Request not found");
  const rows = await prisma.dSARDataLocation.findMany({ where: { requestId }, orderBy: [{ system: "asc" }, { dataType: "asc" }] });
  return rows.map(toDTO);
}

export interface AddDataLocationInput {
  system: string;
  dataType: string;
  found?: boolean;
  redactionsRequired?: boolean;
}

export async function addDataLocation(organizationId: string, requestId: string, input: AddDataLocationInput, actor: Actor): Promise<DataLocationDTO> {
  const req = await prisma.dataSubjectRequest.findFirst({ where: { id: requestId, organizationId }, select: { id: true } });
  if (!req) throw new Error("Request not found");
  if (!input.system?.trim() || !input.dataType?.trim()) throw new Error("system and dataType are required");

  const row = await prisma.dSARDataLocation.upsert({
    where: { requestId_system_dataType: { requestId, system: input.system.trim(), dataType: input.dataType.trim() } },
    update: { found: input.found ?? undefined, redactionsRequired: input.redactionsRequired ?? undefined },
    create: { requestId, system: input.system.trim(), dataType: input.dataType.trim(), found: input.found ?? false, redactionsRequired: input.redactionsRequired ?? false },
  });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "privacy.dsar.data_location_added", resourceType: "DataSubjectRequest", resourceId: requestId,
    afterJson: { system: row.system, dataType: row.dataType } as never, metadata: { source: "privacy" } as never,
  });
  return toDTO(row);
}

export interface UpdateDataLocationInput {
  found?: boolean;
  redactionsRequired?: boolean;
  retrieved?: boolean;
}

export async function updateDataLocation(organizationId: string, requestId: string, locationId: string, input: UpdateDataLocationInput, actor: Actor): Promise<DataLocationDTO> {
  const row = await prisma.dSARDataLocation.findFirst({ where: { id: locationId, requestId }, include: { request: { select: { organizationId: true } } } });
  if (!row || row.request.organizationId !== organizationId) throw new Error("Data location not found");

  const data: Record<string, unknown> = {};
  if (input.found !== undefined) data.found = input.found;
  if (input.redactionsRequired !== undefined) data.redactionsRequired = input.redactionsRequired;
  if (input.retrieved !== undefined) data.retrievedAt = input.retrieved ? new Date() : null;

  const updated = await prisma.dSARDataLocation.update({ where: { id: locationId }, data: data as never });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "privacy.dsar.data_location_updated", resourceType: "DataSubjectRequest", resourceId: requestId,
    afterJson: { locationId, ...data } as never, metadata: { source: "privacy", system: updated.system } as never,
  });
  return toDTO(updated);
}

export interface SeedInventoryResult {
  scanned: number;
  created: number;
}

/** Friendly (system, dataType) for a discovered M365 source (pure). */
export function mapEnumeratedSource(ds: Pick<EnumeratedDataSource, "type" | "displayLabel">): { system: string; dataType: string } {
  const t = String(ds.type).toUpperCase();
  if (t.includes("MAILBOX") || t.includes("EMAIL")) return { system: "Exchange Online", dataType: "email" };
  if (t.includes("ONEDRIVE")) return { system: "OneDrive", dataType: "files" };
  if (t.includes("TEAMS")) return { system: "Microsoft Teams", dataType: "chats" };
  if (t.includes("SHAREPOINT") || t.includes("SITE")) return { system: "SharePoint", dataType: "documents" };
  return { system: ds.displayLabel || "Microsoft 365", dataType: t.toLowerCase().replace(/_/g, "-") };
}

export interface DiscoverM365Result {
  scanned: number;
  created: number;
  simulated: boolean;
  locations: DataLocationDTO[];
}

/**
 * Discover the data subject's real Microsoft 365 data sources (mailbox,
 * OneDrive, Teams, SharePoint) via the same Graph enumeration legal hold uses,
 * and add them to the DSAR data-location checklist. Requires the subject to
 * have an email/UPN. Idempotent by (system, dataType). Chain-sealed.
 */
export async function discoverM365DataLocations(organizationId: string, requestId: string, actor: Actor): Promise<DiscoverM365Result> {
  const req = await prisma.dataSubjectRequest.findFirst({
    where: { id: requestId, organizationId },
    include: { requesterPerson: { select: { email: true, externalRef: true } } },
  });
  if (!req) throw new Error("Request not found");
  const identifier = req.requesterPerson?.email || req.requesterPerson?.externalRef;
  if (!identifier) throw new Error("The data subject has no email / UPN to enumerate M365 data sources for.");

  const [sources, status] = await Promise.all([
    enumerateM365DataSourcesForUser(organizationId, identifier),
    getM365ConnectionStatus(organizationId).catch(() => ({ mode: "mock" as const })),
  ]);

  let created = 0;
  const seen = new Set<string>();
  for (const ds of sources) {
    const { system, dataType } = mapEnumeratedSource(ds);
    const key = `${system}|${dataType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const existing = await prisma.dSARDataLocation.findUnique({
      where: { requestId_system_dataType: { requestId, system, dataType } },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.dSARDataLocation.create({ data: { requestId, system, dataType, found: false, redactionsRequired: false } });
    created += 1;
  }

  if (created > 0) {
    await logAudit({
      organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
      action: "privacy.dsar.m365_locations_discovered", resourceType: "DataSubjectRequest", resourceId: requestId,
      afterJson: { created, scanned: sources.length, simulated: status.mode !== "real" } as never,
      metadata: { source: "privacy", channel: "m365" } as never,
    });
  }

  return { scanned: sources.length, created, simulated: status.mode !== "real", locations: await listDataLocations(organizationId, requestId) };
}

/**
 * Seed candidate data locations from the org's ROPA. Every system named in a
 * DataProcessingActivity becomes a (system × first-data-type) checklist row to
 * confirm. Idempotent — existing (system, dataType) cells are left untouched.
 */
export async function seedInventoryFromRopa(organizationId: string, requestId: string, actor: Actor): Promise<SeedInventoryResult> {
  const req = await prisma.dataSubjectRequest.findFirst({ where: { id: requestId, organizationId }, select: { id: true } });
  if (!req) throw new Error("Request not found");
  const ropas = await prisma.dataProcessingActivity.findMany({ where: { organizationId }, select: { systems: true, dataTypes: true } });

  const candidates: Array<{ system: string; dataType: string }> = [];
  for (const r of ropas) {
    const systems = Array.isArray(r.systems) ? (r.systems as unknown[]).map(String) : [];
    const dataTypes = Array.isArray(r.dataTypes) ? (r.dataTypes as unknown[]).map(String) : [];
    const dataType = dataTypes[0] ?? "personal-data";
    for (const system of systems) candidates.push({ system, dataType });
  }

  let created = 0;
  for (const c of candidates) {
    const exists = await prisma.dSARDataLocation.findUnique({
      where: { requestId_system_dataType: { requestId, system: c.system, dataType: c.dataType } },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.dSARDataLocation.create({ data: { requestId, system: c.system, dataType: c.dataType, found: false, redactionsRequired: false } });
    created += 1;
  }
  if (created > 0) {
    await logAudit({
      organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
      action: "privacy.dsar.inventory_seeded", resourceType: "DataSubjectRequest", resourceId: requestId,
      afterJson: { created, scanned: candidates.length } as never, metadata: { source: "privacy" } as never,
    });
  }
  return { scanned: candidates.length, created };
}
