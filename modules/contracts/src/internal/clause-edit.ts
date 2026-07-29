/**
 * Human-owned clause editing (CLM Phase 6c).
 *
 * The clause set was machine-owned — populated only by the extractor and the
 * AI remediator. This gives the attorney direct control: add a clause by type
 * (Confidentiality, etc.), edit any clause's text / risk / deviation, or
 * delete one. Every change is chain-sealed and snapshots a new version so the
 * redline + the derived risk score reflect the human's edits.
 *
 * A manual edit is authoritative: the human sets `risk` + `deviation`
 * explicitly (they're judging the language), rather than re-running the
 * keyword extractor over one clause.
 */
import { prisma, logAudit } from "@aegis/db";
import { snapshotContractVersion } from "./versions";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };
type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

const actorFields = (actor: Actor) => ({
  actorId: actor.id,
  actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
});

async function assertContract(organizationId: string, contractId: string) {
  const c = await prisma.contract.findFirst({ where: { id: contractId, organizationId }, select: { id: true } });
  if (!c) throw new Error("Contract not found");
}

export interface ManualClauseInput {
  type: string;
  text: string;
  summary?: string | null;
  risk?: RiskLevel;
  deviation?: boolean;
}

/** Add a clause by hand. Chain-sealed + snapshots a version. */
export async function addClauseManual(organizationId: string, contractId: string, input: ManualClauseInput, actor: Actor) {
  await assertContract(organizationId, contractId);
  if (!input.type?.trim()) throw new Error("Clause type is required");
  if (!input.text?.trim()) throw new Error("Clause text is required");

  const clause = await prisma.contractClause.create({
    data: {
      contractId,
      type: input.type.trim().toUpperCase().replace(/\s+/g, "_"),
      text: input.text.trim(),
      summary: input.summary ?? null,
      risk: input.risk ?? "LOW",
      deviation: input.deviation ?? false,
    },
  });
  await logAudit({
    organizationId, ...actorFields(actor),
    action: "contract.clause.added",
    resourceType: "ContractClause",
    resourceId: clause.id,
    afterJson: { contractId, type: clause.type, risk: clause.risk, deviation: clause.deviation } as never,
    metadata: { source: "contracts", manual: true } as never,
  });
  try { await snapshotContractVersion(organizationId, contractId, { label: `Clause added: ${clause.type.replace(/_/g, " ")}`, source: "MANUAL" }, actor); } catch { /* non-critical */ }
  return clause;
}

export interface UpdateClauseInput {
  type?: string;
  text?: string;
  summary?: string | null;
  risk?: RiskLevel;
  deviation?: boolean;
}

/** Edit a clause's fields by hand. Chain-sealed (before/after) + snapshot. */
export async function updateClause(organizationId: string, contractId: string, clauseId: string, patch: UpdateClauseInput, actor: Actor) {
  const clause = await prisma.contractClause.findFirst({ where: { id: clauseId, contractId, contract: { organizationId } } });
  if (!clause) throw new Error("Clause not found");

  const data: Record<string, unknown> = {};
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const consider = <K extends keyof UpdateClauseInput>(key: K, transform?: (v: NonNullable<UpdateClauseInput[K]>) => unknown) => {
    if (!(key in patch)) return;
    let next: unknown = patch[key];
    if (key === "type" && typeof next === "string") next = next.trim().toUpperCase().replace(/\s+/g, "_");
    if (transform && next != null) next = transform(next as never);
    const cur = (clause as Record<string, unknown>)[key];
    if (next === cur) return;
    data[key] = next; before[key] = cur; after[key] = next;
  };
  consider("type");
  consider("text", (v) => String(v).trim());
  consider("summary");
  consider("risk");
  consider("deviation");
  if (Object.keys(data).length === 0) return clause;

  const updated = await prisma.contractClause.update({ where: { id: clauseId }, data });
  await logAudit({
    organizationId, ...actorFields(actor),
    action: "contract.clause.updated",
    resourceType: "ContractClause",
    resourceId: clauseId,
    beforeJson: before as never,
    afterJson: after as never,
    metadata: { source: "contracts", manual: true, contractId, fields: Object.keys(data) } as never,
  });
  try { await snapshotContractVersion(organizationId, contractId, { label: `Clause edited: ${updated.type.replace(/_/g, " ")}`, source: "MANUAL" }, actor); } catch { /* non-critical */ }
  return updated;
}

/** Delete a clause by hand. Chain-sealed + snapshot. */
export async function deleteClause(organizationId: string, contractId: string, clauseId: string, actor: Actor) {
  const clause = await prisma.contractClause.findFirst({ where: { id: clauseId, contractId, contract: { organizationId } } });
  if (!clause) throw new Error("Clause not found");
  await prisma.contractClause.delete({ where: { id: clauseId } });
  await logAudit({
    organizationId, ...actorFields(actor),
    action: "contract.clause.removed",
    resourceType: "ContractClause",
    resourceId: clauseId,
    beforeJson: { contractId, type: clause.type, risk: clause.risk, text: clause.text } as never,
    metadata: { source: "contracts", manual: true } as never,
  });
  try { await snapshotContractVersion(organizationId, contractId, { label: `Clause removed: ${clause.type.replace(/_/g, " ")}`, source: "MANUAL" }, actor); } catch { /* non-critical */ }
}
