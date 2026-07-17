/**
 * Playbook clause library (CTR-5) — the standard/fallback positions a
 * contract's clauses are reviewed against. Reads feed the clause-vs-
 * playbook comparison in the contract detail; writes are chain-sealed and
 * admin-gated at the route. One canonical entry per clause type per org.
 */
import { prisma, logAudit } from "@aegis/db";
import type { ContractRisk } from "@aegis/db";

export interface ClauseLibraryEntryDTO {
  id: string;
  clauseType: string;
  title: string;
  standardText: string;
  fallbackText: string | null;
  guidance: string | null;
  riskIfDeviated: "LOW" | "MEDIUM" | "HIGH";
  active: boolean;
  sortOrder: number;
}

export interface UpsertClauseLibraryInput {
  clauseType: string;
  title: string;
  standardText: string;
  fallbackText?: string | null;
  guidance?: string | null;
  riskIfDeviated?: ContractRisk;
  active?: boolean;
  sortOrder?: number;
}

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

const toDTO = (e: {
  id: string; clauseType: string; title: string; standardText: string;
  fallbackText: string | null; guidance: string | null; riskIfDeviated: ContractRisk;
  active: boolean; sortOrder: number;
}): ClauseLibraryEntryDTO => ({
  id: e.id,
  clauseType: e.clauseType,
  title: e.title,
  standardText: e.standardText,
  fallbackText: e.fallbackText,
  guidance: e.guidance,
  riskIfDeviated: e.riskIfDeviated,
  active: e.active,
  sortOrder: e.sortOrder,
});

export async function listClauseLibrary(
  organizationId: string,
  opts?: { includeInactive?: boolean },
): Promise<ClauseLibraryEntryDTO[]> {
  const entries = await prisma.clauseLibraryEntry.findMany({
    where: { organizationId, ...(opts?.includeInactive ? {} : { active: true }) },
    orderBy: [{ sortOrder: "asc" }, { clauseType: "asc" }],
  });
  return entries.map(toDTO);
}

/** Map of clauseType → entry, for the detail comparison (active only). */
export async function getClauseLibraryByType(organizationId: string): Promise<Record<string, ClauseLibraryEntryDTO>> {
  const entries = await listClauseLibrary(organizationId, { includeInactive: false });
  return Object.fromEntries(entries.map((e) => [e.clauseType, e]));
}

/** Upsert on (org, clauseType); chain-sealed. */
export async function upsertClauseLibraryEntry(
  organizationId: string,
  input: UpsertClauseLibraryInput,
  actor: Actor,
): Promise<ClauseLibraryEntryDTO> {
  const clauseType = input.clauseType.trim().toUpperCase();
  if (!clauseType) throw new Error("clauseType is required");
  if (!input.title.trim()) throw new Error("title is required");
  if (!input.standardText.trim()) throw new Error("standardText is required");

  const existing = await prisma.clauseLibraryEntry.findUnique({
    where: { organizationId_clauseType: { organizationId, clauseType } },
  });

  const data = {
    title: input.title.trim(),
    standardText: input.standardText.trim(),
    fallbackText: input.fallbackText?.trim() || null,
    guidance: input.guidance?.trim() || null,
    riskIfDeviated: input.riskIfDeviated ?? "MEDIUM",
    active: input.active ?? true,
    sortOrder: input.sortOrder ?? 0,
  };

  const entry = existing
    ? await prisma.clauseLibraryEntry.update({ where: { id: existing.id }, data })
    : await prisma.clauseLibraryEntry.create({ data: { organizationId, clauseType, ...data } });

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? "USER",
    action: existing ? "contract.clause_library.updated" : "contract.clause_library.created",
    resourceType: "ClauseLibraryEntry",
    resourceId: entry.id,
    beforeJson: existing ? { title: existing.title, riskIfDeviated: existing.riskIfDeviated, active: existing.active } as never : undefined,
    afterJson: { clauseType, title: data.title, riskIfDeviated: data.riskIfDeviated, active: data.active } as never,
    metadata: { source: "contracts" } as never,
  });
  return toDTO(entry);
}

export async function deleteClauseLibraryEntry(organizationId: string, id: string, actor: Actor): Promise<void> {
  const entry = await prisma.clauseLibraryEntry.findFirst({ where: { id, organizationId } });
  if (!entry) throw new Error("Clause library entry not found");
  await prisma.clauseLibraryEntry.delete({ where: { id } });
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? "USER",
    action: "contract.clause_library.deleted",
    resourceType: "ClauseLibraryEntry",
    resourceId: id,
    beforeJson: { clauseType: entry.clauseType, title: entry.title } as never,
    metadata: { source: "contracts" } as never,
  });
}
