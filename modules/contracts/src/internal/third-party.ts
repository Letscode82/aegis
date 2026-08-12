/**
 * Third-party paper review workflow (CTR-12).
 *
 * When the business receives a contract on the counterparty's paper, they
 * submit it here for internal-legal review before signing. This composes the
 * pieces that already exist into one action:
 *
 *   1. create the Contract as THIRD_PARTY paper, storing the received text as
 *      the draft body;
 *   2. run the deterministic extractor so clauses + risk are analysed;
 *   3. start the governance review ladder (submitContractForApproval) — AI risk
 *      review → legal review → GC approval → counter-signature.
 *
 * From there the business ↔ legal back-and-forth happens in the collaboration
 * thread (CTR-10), redline in the version diff, and signing in the signatures
 * panel — the full inbound-paper journey, governed and chain-sealed.
 */
import { createContract } from "./service";
import { extractAndPersistContractKnowledge } from "./intake-spawn";
import { submitContractForApproval } from "./approval";

type Actor = { id: string; type?: "USER" | "AGENT" | "SYSTEM" };

export interface ReviewThirdPartyInput {
  title: string;
  type: string;
  counterpartyId?: string | null;
  matterId?: string | null;
  /** The counterparty's contract text (their paper) to review. */
  text: string;
  value?: number | null;
  currency?: string | null;
  governingLaw?: string | null;
}

export interface ReviewThirdPartyResult {
  contractId: string;
  clauseCount: number;
  submitted: boolean;
}

/**
 * Intake a third-party contract and put it straight into the review ladder.
 * Returns the new contract id and the extracted-clause counts.
 */
export async function reviewThirdPartyContract(
  organizationId: string,
  input: ReviewThirdPartyInput,
  actor: Actor,
): Promise<ReviewThirdPartyResult> {
  if (!input.title?.trim()) throw new Error("Title is required");
  if (!input.text?.trim()) throw new Error("Paste the third-party contract text to review");

  const contract = await createContract(
    organizationId,
    {
      title: input.title.trim(),
      type: input.type || "Third-party",
      status: "DRAFT",
      counterpartyId: input.counterpartyId ?? null,
      matterId: input.matterId ?? null,
      value: input.value ?? null,
      currency: input.currency ?? "USD",
      governingLaw: input.governingLaw ?? null,
      origin: "THIRD_PARTY",
      draftText: input.text,
    },
    actor,
  );

  const extraction = await extractAndPersistContractKnowledge(
    organizationId,
    contract.id,
    input.text,
    contract.type,
    { id: actor.id, type: "USER" },
    { initialSnapshotLabel: "Third-party paper (received)" },
  );

  // Start the governance review ladder (AI risk → legal → GC → signature).
  let submitted = false;
  try {
    await submitContractForApproval(organizationId, contract.id, { id: actor.id, type: "USER" });
    submitted = true;
  } catch {
    // If the ladder library isn't seeded, the contract still exists in DRAFT for
    // manual review — don't fail the intake.
  }

  return {
    contractId: contract.id,
    clauseCount: extraction.clauses,
    submitted,
  };
}
