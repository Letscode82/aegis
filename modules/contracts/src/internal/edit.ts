/**
 * Contract editing (CLM Phase 5c).
 *
 * Two chain-sealed edit paths that were missing (the module could create +
 * transition status, but never edit):
 *   - updateContract: patch the header/metadata fields (title, counterparty,
 *     value, dates, governing law, …), writing a `contract.updated` row with
 *     a before/after diff of exactly the fields that changed.
 *   - updateContractDraft: edit the working draft body (the scope-of-services
 *     prose), persist it, and re-extract the clause set into a new version so
 *     the clause analysis + risk score stay in sync with the text.
 *
 * Status is deliberately NOT editable here — it moves only through the
 * guarded `transitionContractStatus` state machine.
 */
import { prisma, logAudit } from "@aegis/db";
import { reExtractContractClauses } from "./reextract";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

const actorFields = (actor: Actor) => ({
  actorId: actor.id,
  actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
});

export interface UpdateContractInput {
  title?: string;
  type?: string;
  counterpartyId?: string | null;
  matterId?: string | null;
  value?: number | null;
  currency?: string;
  effectiveDate?: Date | null;
  expiryDate?: Date | null;
  autoRenew?: boolean;
  noticeWindowDays?: number | null;
  governingLaw?: string | null;
}

const EDITABLE: (keyof UpdateContractInput)[] = [
  "title", "type", "counterpartyId", "matterId", "value", "currency",
  "effectiveDate", "expiryDate", "autoRenew", "noticeWindowDays", "governingLaw",
];

/**
 * Patch a contract's metadata. Only the fields present in `patch` are
 * considered; only those that actually change are written and diffed. Returns
 * the updated contract. Chain-sealed `contract.updated` with a per-field
 * before/after diff (no-op — no audit row — when nothing changed).
 */
export async function updateContract(
  organizationId: string,
  contractId: string,
  patch: UpdateContractInput,
  actor: Actor,
) {
  const existing = await prisma.contract.findFirst({ where: { id: contractId, organizationId } });
  if (!existing) throw new Error("Contract not found");

  if (patch.counterpartyId) {
    const cp = await prisma.counterparty.findFirst({ where: { id: patch.counterpartyId, organizationId }, select: { id: true } });
    if (!cp) throw new Error("Counterparty not found");
  }

  const data: Record<string, unknown> = {};
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const key of EDITABLE) {
    if (!(key in patch)) continue;
    const next = patch[key] ?? null;
    const cur = (existing as Record<string, unknown>)[key] ?? null;
    const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v);
    if (norm(next) === norm(cur)) continue;
    data[key] = next;
    before[key] = norm(cur);
    after[key] = norm(next);
  }

  if (Object.keys(data).length === 0) return existing; // nothing changed

  const updated = await prisma.contract.update({ where: { id: contractId }, data });
  await logAudit({
    organizationId,
    ...actorFields(actor),
    action: "contract.updated",
    resourceType: "Contract",
    resourceId: contractId,
    beforeJson: before as never,
    afterJson: after as never,
    metadata: { source: "contracts", fields: Object.keys(data) } as never,
  });
  return updated;
}

export interface UpdateDraftResult {
  clauseCount: number;
  deviationCount: number;
  newVersion: number | null;
}

/**
 * Edit the working draft body (scope of services), persist it, and re-extract
 * the clause set into a new version so the analysis + risk score reflect the
 * new text. Chain-sealed (`contract.draft_updated` + the re-extraction rows).
 */
export async function updateContractDraft(
  organizationId: string,
  contractId: string,
  draftText: string,
  actor: Actor,
): Promise<UpdateDraftResult> {
  const existing = await prisma.contract.findFirst({ where: { id: contractId, organizationId }, select: { id: true } });
  if (!existing) throw new Error("Contract not found");
  if (!draftText || !draftText.trim()) throw new Error("Draft text is required");

  await prisma.contract.update({ where: { id: contractId }, data: { draftText } });
  const ext = await reExtractContractClauses(organizationId, contractId, draftText, actor, {
    beforeLabel: "Before draft edit",
    resultLabel: "Draft edited",
    resultSource: "EXTRACTION",
  });

  await logAudit({
    organizationId,
    ...actorFields(actor),
    action: "contract.draft_updated",
    resourceType: "Contract",
    resourceId: contractId,
    afterJson: { clauseCount: ext.clauseCount, deviationCount: ext.deviationCount, newVersion: ext.newVersion } as never,
    metadata: { source: "contracts" } as never,
  });
  return ext;
}
