/**
 * Contract amendments (CTR-9b) — the sanctioned way to change the signed terms
 * of an executed, locked contract.
 *
 * The integrity lock (integrity.ts) blocks direct edits to an executed
 * contract's material terms. This opens the proper path instead: snapshot the
 * current (signed) version, move the contract back into IN_NEGOTIATION — which
 * lifts the lock — and record a chain-sealed `contract.amendment.opened` row.
 * From there the normal lifecycle applies: edit the terms → re-approval ladder
 * → re-signature → EXECUTED, at which point the terms fingerprint is re-sealed
 * to the amended, re-signed baseline (transitionContractStatus).
 *
 * No new schema: the amendment IS the audited round-trip. The pre-amendment
 * fingerprint stays on `executedTermsHash` until re-execution, and the version
 * snapshot preserves the prior clause set.
 */
import { prisma, logAudit } from "@aegis/db";
import { transitionContractStatus } from "./service";
import { snapshotContractVersion } from "./versions";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

/** Statuses from which an amendment can be opened (a contract in force). The
 *  state machine allows ACTIVE/EXPIRED → IN_NEGOTIATION. */
export const AMENDABLE_STATUSES = new Set(["ACTIVE", "EXPIRED"]);

export class ContractNotAmendableError extends Error {
  constructor(public readonly contractId: string, public readonly status: string) {
    super(
      `This contract is ${status} and can't be amended directly. Amendments open from an in-force contract (ACTIVE or EXPIRED).`,
    );
    this.name = "ContractNotAmendableError";
  }
}

/**
 * Open an amendment on a locked, in-force contract: snapshot the signed version,
 * unlock by moving to IN_NEGOTIATION, and chain-seal the intent. Returns the
 * updated contract (now editable). The caller then edits terms and runs the
 * approval + signature flow, which re-seals a fresh integrity baseline.
 */
export async function openContractAmendment(
  organizationId: string,
  contractId: string,
  reason: string | null,
  actor: Actor,
) {
  const contract = await prisma.contract.findFirst({ where: { id: contractId, organizationId } });
  if (!contract) throw new Error("Contract not found");
  if (!AMENDABLE_STATUSES.has(contract.status)) {
    throw new ContractNotAmendableError(contractId, contract.status);
  }

  // Preserve the pre-amendment (signed) clause set as a version. Best-effort —
  // no-ops if the clause set is unchanged from the last snapshot.
  await snapshotContractVersion(
    organizationId,
    contractId,
    { label: `Pre-amendment (${new Date().toISOString().slice(0, 10)})`, source: "MANUAL" },
    actor,
  ).catch(() => {});

  // Unlock: ACTIVE/EXPIRED → IN_NEGOTIATION (guarded + chain-sealed by the
  // state machine). The integrity lock lifts because IN_NEGOTIATION is not a
  // locked status; the executedTermsHash stays until re-execution re-seals it.
  const updated = await transitionContractStatus(organizationId, contractId, "IN_NEGOTIATION" as never, {
    id: actor.id,
    type: actor.type ?? "USER",
  });

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
    action: "contract.amendment.opened",
    resourceType: "Contract",
    resourceId: contractId,
    beforeJson: { status: contract.status, executedTermsHash: contract.executedTermsHash } as never,
    afterJson: { status: "IN_NEGOTIATION", reason: reason ?? null } as never,
    metadata: { source: "contracts" } as never,
  });

  return updated;
}
