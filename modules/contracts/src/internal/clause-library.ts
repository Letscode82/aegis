/**
 * Contract clause library (📖 Playbook) — UNIFIED with the oKF Knowledge.
 *
 * There is now ONE clause store: the `contract-clauses` KnowledgePack of
 * `KnowledgeItem`s (kind CLAUSE) that the Contract Review agent reads. This
 * service is a view/editor onto it, so editing the Contracts 📖 Playbook and
 * editing the agent's Knowledge (Agent Designer → Knowledge tab) are the
 * same data. The legacy `ClauseLibraryEntry` table is retired.
 *
 * Mapping (KnowledgeItem ↔ ClauseLibraryEntryDTO):
 *   code           ↔ clauseType (upper-cased)
 *   title          ↔ title
 *   bodyMarkdown   ↔ standardText
 *   dataJson       ↔ { fallbackText, guidance, riskIfDeviated }
 *                    (reads also accept the seed's `severityIfDeviated`)
 *   active/sortOrder pass through
 *
 * Reads feed the clause-vs-playbook comparison; writes are chain-sealed.
 */
import { prisma, logAudit } from "@aegis/db";
import type { ContractRisk, KnowledgeItem } from "@aegis/db";

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

/** The canonical clause pack key (matches the oKF seed + Contract Review). */
const CLAUSE_PACK_KEY = "contract-clauses";

/** Get (or lazily create) the org's contract-clauses KnowledgePack. The pack
 *  is bound to contract-review-agent so it also shows in that agent's
 *  Knowledge tab — one store, two editors. */
async function getOrCreateClausePack(organizationId: string): Promise<{ id: string }> {
  const existing = await prisma.knowledgePack.findUnique({
    where: { organizationId_key: { organizationId, key: CLAUSE_PACK_KEY } },
    select: { id: true },
  });
  if (existing) return existing;
  return prisma.knowledgePack.create({
    data: {
      organizationId,
      key: CLAUSE_PACK_KEY,
      name: "Contract clause library",
      description: "The risk-term checklist the Contract Review agent flags against. Edited here and in Agent Designer → Knowledge.",
      kind: "CONTRACT_CLAUSES",
      agentKey: "contract-review-agent",
      status: "PUBLISHED",
      publishedVersion: 1,
    },
    select: { id: true },
  });
}

const normRisk = (v: unknown): "LOW" | "MEDIUM" | "HIGH" => {
  const s = String(v || "").toUpperCase();
  return s === "LOW" || s === "HIGH" ? s : "MEDIUM";
};

const toDTO = (it: KnowledgeItem): ClauseLibraryEntryDTO => {
  const d = (it.dataJson as Record<string, unknown>) ?? {};
  return {
    id: it.id,
    clauseType: it.code,
    title: it.title,
    standardText: it.bodyMarkdown,
    fallbackText: (d.fallbackText as string) ?? null,
    guidance: (d.guidance as string) ?? null,
    // Accept either the library's riskIfDeviated or the seed's severityIfDeviated.
    riskIfDeviated: normRisk(d.riskIfDeviated ?? d.severityIfDeviated),
    active: it.active,
    sortOrder: it.sortOrder,
  };
};

export async function listClauseLibrary(
  organizationId: string,
  opts?: { includeInactive?: boolean },
): Promise<ClauseLibraryEntryDTO[]> {
  const pack = await prisma.knowledgePack.findUnique({
    where: { organizationId_key: { organizationId, key: CLAUSE_PACK_KEY } },
    select: { id: true },
  });
  if (!pack) return [];
  const items = await prisma.knowledgeItem.findMany({
    where: { packId: pack.id, kind: "CLAUSE", ...(opts?.includeInactive ? {} : { active: true }) },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  return items.map(toDTO);
}

/** Map of clauseType → entry, for the detail comparison (active only). */
export async function getClauseLibraryByType(organizationId: string): Promise<Record<string, ClauseLibraryEntryDTO>> {
  const entries = await listClauseLibrary(organizationId, { includeInactive: false });
  return Object.fromEntries(entries.map((e) => [e.clauseType, e]));
}

/**
 * Render the active clause library as the prose playbook the contract
 * agents review against. Returns "" when empty so callers fall back to
 * their built-in default.
 */
export async function getContractPlaybookText(organizationId: string): Promise<string> {
  const entries = await listClauseLibrary(organizationId, { includeInactive: false });
  if (entries.length === 0) return "";
  const lines = entries.map((e) => {
    const parts = [`- ${e.title} (${e.clauseType}): ${e.standardText}`];
    if (e.fallbackText) parts.push(`  Fallback: ${e.fallbackText}`);
    if (e.guidance) parts.push(`  Guidance: ${e.guidance}`);
    parts.push(`  Risk if deviated: ${e.riskIfDeviated}.`);
    return parts.join("\n");
  });
  return `AEGIS Contract Playbook (org-configured — check every clause against these positions):\n${lines.join("\n")}`;
}

/** Upsert a clause (by code within the org's clause pack); chain-sealed. */
export async function upsertClauseLibraryEntry(
  organizationId: string,
  input: UpsertClauseLibraryInput,
  actor: Actor,
): Promise<ClauseLibraryEntryDTO> {
  const clauseType = input.clauseType.trim().toUpperCase();
  if (!clauseType) throw new Error("clauseType is required");
  if (!input.title.trim()) throw new Error("title is required");
  if (!input.standardText.trim()) throw new Error("standardText is required");

  const pack = await getOrCreateClausePack(organizationId);
  const existing = await prisma.knowledgeItem.findUnique({
    where: { packId_code: { packId: pack.id, code: clauseType } },
  });
  const dataJson = {
    fallbackText: input.fallbackText?.trim() || null,
    guidance: input.guidance?.trim() || null,
    riskIfDeviated: input.riskIfDeviated ?? "MEDIUM",
  };
  const base = {
    kind: "CLAUSE" as const,
    title: input.title.trim(),
    bodyMarkdown: input.standardText.trim(),
    dataJson: dataJson as never,
    active: input.active ?? true,
    sortOrder: input.sortOrder ?? 0,
  };
  const item = existing
    ? await prisma.knowledgeItem.update({ where: { id: existing.id }, data: base })
    : await prisma.knowledgeItem.create({ data: { organizationId, packId: pack.id, code: clauseType, ...base } });

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? "USER",
    action: existing ? "contract.clause_library.updated" : "contract.clause_library.created",
    resourceType: "KnowledgeItem",
    resourceId: item.id,
    beforeJson: existing ? { title: existing.title, active: existing.active } as never : undefined,
    afterJson: { clauseType, title: base.title, riskIfDeviated: dataJson.riskIfDeviated, active: base.active } as never,
    metadata: { source: "contracts", store: "oKF:contract-clauses" } as never,
  });
  return toDTO(item);
}

export async function deleteClauseLibraryEntry(organizationId: string, id: string, actor: Actor): Promise<void> {
  const pack = await prisma.knowledgePack.findUnique({
    where: { organizationId_key: { organizationId, key: CLAUSE_PACK_KEY } },
    select: { id: true },
  });
  const item = pack ? await prisma.knowledgeItem.findFirst({ where: { id, packId: pack.id } }) : null;
  if (!item) throw new Error("Clause library entry not found");
  await prisma.knowledgeItem.delete({ where: { id } });
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? "USER",
    action: "contract.clause_library.deleted",
    resourceType: "KnowledgeItem",
    resourceId: id,
    beforeJson: { clauseType: item.code, title: item.title } as never,
    metadata: { source: "contracts", store: "oKF:contract-clauses" } as never,
  });
}
