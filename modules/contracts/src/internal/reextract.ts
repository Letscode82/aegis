/**
 * Live re-extraction on amendment (CLM Phase 3).
 *
 * Contract intelligence today is populated once, at intake-spawn. When a
 * contract is amended (a new redline, a counter-signed version), its clause
 * analysis goes stale. `reExtractContractClauses` re-runs the deterministic
 * extractor over the amended text, replaces the ContractClause rows, and
 * snapshots a new EXTRACTION version — so the existing version redline shows
 * exactly what the amendment changed, clause by clause, against the playbook.
 *
 * Obligations are deliberately NOT re-derived: they carry human-set owners,
 * due dates, and lifecycle status (Phase 2), so an amendment must never
 * clobber them. New/changed obligations are managed explicitly.
 */
import { prisma, logAudit } from "@aegis/db";
import type { ContractVersionSource } from "@aegis/db";
import { extractContractKnowledge } from "./extract";
import { addClause } from "./service";
import { snapshotContractVersion } from "./versions";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

export interface ReExtractResult {
  clauseCount: number;
  deviationCount: number;
  /** The new version; redline it against the prior version. */
  newVersion: number | null;
}

export interface ReExtractOptions {
  /** Label for the "before" snapshot (default "Before re-extraction"). */
  beforeLabel?: string;
  /** Label for the resulting snapshot (default "Re-extraction"). */
  resultLabel?: string;
  /** Source for the resulting snapshot (default "EXTRACTION"). A negotiation
   *  turn passes "COUNTERPARTY" so the version history reads as a turn. */
  resultSource?: ContractVersionSource;
}

export async function reExtractContractClauses(
  organizationId: string,
  contractId: string,
  sourceText: string,
  actor: Actor,
  opts?: ReExtractOptions,
): Promise<ReExtractResult> {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, organizationId },
    select: { id: true, type: true },
  });
  if (!contract) throw new Error("Contract not found");
  if (!sourceText || !sourceText.trim()) throw new Error("No contract text provided to extract from");

  // Snapshot the current clause set first, so the "before" is preserved for
  // the redline even if it was never snapshotted (no-op if unchanged).
  await snapshotContractVersion(organizationId, contractId, { label: opts?.beforeLabel ?? "Before re-extraction", source: "MANUAL" }, actor);

  // Replace the clause analysis from the amended text.
  await prisma.contractClause.deleteMany({ where: { contractId } });
  const { clauses } = extractContractKnowledge(sourceText, contract.type);
  for (const c of clauses) await addClause(organizationId, contractId, c, actor);

  const after = await snapshotContractVersion(
    organizationId,
    contractId,
    { label: opts?.resultLabel ?? "Re-extraction", source: opts?.resultSource ?? "EXTRACTION" },
    actor,
  );

  const deviationCount = clauses.filter((c) => c.deviation).length;
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
    action: "contract.reextracted",
    resourceType: "Contract",
    resourceId: contractId,
    afterJson: { clauseCount: clauses.length, deviationCount, newVersion: after?.version ?? null } as never,
    metadata: { source: "contracts" } as never,
  });

  return { clauseCount: clauses.length, deviationCount, newVersion: after?.version ?? null };
}
