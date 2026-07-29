/**
 * Execution & signatures (CLM Phase 5d).
 *
 * Records who signed a contract on behalf of each side, when, and how — a
 * defensible signature record, NOT an e-signature integration (that is a
 * future connector). When both an INTERNAL and a COUNTERPARTY signature are
 * present AND the contract is APPROVED, recording the final signature
 * auto-transitions the contract to EXECUTED through the guarded state machine
 * (which stamps executedAt). Everything chain-sealed.
 *
 * The counterparty's ACCEPT on a review link is their agreement; a
 * COUNTERPARTY signature can be recorded with method "review-accept" to tie
 * the two together, or "recorded" when the attorney enters it on their behalf.
 */
import { prisma, logAudit, type ContractStatus } from "@aegis/db";
import { transitionContractStatus } from "./service";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };
type Party = "INTERNAL" | "COUNTERPARTY";

export interface SignatureDTO {
  id: string;
  party: Party;
  signerName: string;
  signerEmail: string | null;
  signerPersonId: string | null;
  method: string;
  signedAt: string;
}

export interface SignatureState {
  signatures: SignatureDTO[];
  hasInternal: boolean;
  hasCounterparty: boolean;
  bothSigned: boolean;
  status: string;
  canExecute: boolean;
  /** Why execution can't happen yet (null when it can, or already executed). */
  blockedReason: string | null;
  executedAt: string | null;
}

export interface RecordSignatureInput {
  party: Party;
  signerName: string;
  signerEmail?: string | null;
  signerPersonId?: string | null;
  method?: string;
}

const toDTO = (s: {
  id: string; party: Party; signerName: string; signerEmail: string | null;
  signerPersonId: string | null; method: string; signedAt: Date;
}): SignatureDTO => ({
  id: s.id, party: s.party, signerName: s.signerName, signerEmail: s.signerEmail,
  signerPersonId: s.signerPersonId, method: s.method, signedAt: s.signedAt.toISOString(),
});

/** Derive the execution readiness from the signature set + status. Pure-ish. */
function readiness(status: string, hasInternal: boolean, hasCounterparty: boolean): { canExecute: boolean; blockedReason: string | null } {
  const bothSigned = hasInternal && hasCounterparty;
  if (status === "EXECUTED" || status === "ACTIVE") return { canExecute: false, blockedReason: "Already executed." };
  if (status === "TERMINATED") return { canExecute: false, blockedReason: "Contract is terminated." };
  if (!bothSigned) return { canExecute: false, blockedReason: "Both parties must sign before execution." };
  if (status !== "APPROVED") return { canExecute: false, blockedReason: `Contract must be APPROVED before execution (currently ${status}).` };
  return { canExecute: true, blockedReason: null };
}

export async function getContractSignatures(organizationId: string, contractId: string): Promise<SignatureState> {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, organizationId },
    select: { status: true, executedAt: true },
  });
  if (!contract) throw new Error("Contract not found");

  const rows = await prisma.contractSignature.findMany({
    where: { organizationId, contractId },
    orderBy: { signedAt: "asc" },
  });
  const signatures = rows.map(toDTO);
  const hasInternal = signatures.some((s) => s.party === "INTERNAL");
  const hasCounterparty = signatures.some((s) => s.party === "COUNTERPARTY");
  const { canExecute, blockedReason } = readiness(contract.status, hasInternal, hasCounterparty);

  return {
    signatures, hasInternal, hasCounterparty,
    bothSigned: hasInternal && hasCounterparty,
    status: contract.status, canExecute, blockedReason,
    executedAt: contract.executedAt ? contract.executedAt.toISOString() : null,
  };
}

/**
 * Record a signature. If it completes both sides AND the contract is APPROVED,
 * auto-executes (transition to EXECUTED). Returns the updated signature state.
 * Chain-sealed (contract.signature.recorded [+ contract.status_changed on
 * auto-execute]).
 */
export async function recordSignature(
  organizationId: string,
  contractId: string,
  input: RecordSignatureInput,
  actor: Actor,
): Promise<SignatureState & { executed: boolean }> {
  const contract = await prisma.contract.findFirst({ where: { id: contractId, organizationId }, select: { id: true, status: true } });
  if (!contract) throw new Error("Contract not found");
  if (input.party !== "INTERNAL" && input.party !== "COUNTERPARTY") throw new Error("party must be INTERNAL or COUNTERPARTY");
  if (!input.signerName?.trim()) throw new Error("Signer name is required");
  if (contract.status === "EXECUTED" || contract.status === "ACTIVE") throw new Error("Contract is already executed");
  if (contract.status === "TERMINATED") throw new Error("Contract is terminated");

  const sig = await prisma.contractSignature.create({
    data: {
      organizationId, contractId,
      party: input.party,
      signerName: input.signerName.trim(),
      signerEmail: input.signerEmail?.trim() || null,
      signerPersonId: input.signerPersonId || null,
      method: input.method || "recorded",
      createdById: actor.id,
    },
  });
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
    action: "contract.signature.recorded",
    resourceType: "Contract",
    resourceId: contractId,
    afterJson: { signatureId: sig.id, party: sig.party, signerName: sig.signerName, method: sig.method } as never,
    metadata: { source: "contracts" } as never,
  });

  // Auto-execute when both sides have now signed and the contract is APPROVED.
  const counts = await prisma.contractSignature.groupBy({ by: ["party"], where: { contractId }, _count: true });
  const hasInternal = counts.some((c) => c.party === "INTERNAL");
  const hasCounterparty = counts.some((c) => c.party === "COUNTERPARTY");
  let executed = false;
  if (hasInternal && hasCounterparty && contract.status === "APPROVED") {
    await transitionContractStatus(organizationId, contractId, "EXECUTED" as ContractStatus, actor);
    executed = true;
  }

  const state = await getContractSignatures(organizationId, contractId);
  return { ...state, executed };
}

/** Remove a signature (mistake correction) — only before execution. Chain-sealed. */
export async function removeSignature(organizationId: string, contractId: string, signatureId: string, actor: Actor): Promise<SignatureState> {
  const contract = await prisma.contract.findFirst({ where: { id: contractId, organizationId }, select: { status: true } });
  if (!contract) throw new Error("Contract not found");
  if (contract.status === "EXECUTED" || contract.status === "ACTIVE") throw new Error("Cannot remove a signature after execution");
  const sig = await prisma.contractSignature.findFirst({ where: { id: signatureId, organizationId, contractId } });
  if (!sig) throw new Error("Signature not found");

  await prisma.contractSignature.delete({ where: { id: signatureId } });
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
    action: "contract.signature.removed",
    resourceType: "Contract",
    resourceId: contractId,
    beforeJson: { signatureId, party: sig.party, signerName: sig.signerName } as never,
    metadata: { source: "contracts" } as never,
  });
  return getContractSignatures(organizationId, contractId);
}
