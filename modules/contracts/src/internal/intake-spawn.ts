/**
 * Intake CLM → Contract spawn + shared-agent extraction (server-only,
 * chain-sealed). The "both are the same" wiring: an approved contract-
 * type intake ticket creates the real Contract row (mirror of the
 * matter-spawn that already links IntakeTicket.matterId), and the shared
 * contract extractor populates its clauses + obligations. The exact same
 * extractor runs from inside the Contracts module on renewal/amendment —
 * one implementation, invoked from two entry points.
 *
 * Idempotent: a ticket that already spawned a contract is skipped.
 * Governance: `contract.created` is attributed to the approving USER; the
 * extracted clauses/obligations are attributed to the AGENT actor, so the
 * ledger distinguishes the human decision from the machine's analysis.
 */
import { prisma } from "@aegis/db";
import { createContract, addClause, createObligation } from "./service";
import { extractContractKnowledge } from "./extract";

interface Actor {
  id: string | null;
  organizationId?: string;
  type?: "USER" | "AGENT" | "SYSTEM";
}

export interface ContractExtractionResult {
  clauses: number;
  obligations: number;
}

/**
 * Persist the shared extractor's output onto a contract. Every clause +
 * obligation is chain-sealed as an AGENT-actor mutation. Reusable by the
 * Contracts module's own renewal/amendment review — the single
 * "run the contract agent over this text" surface.
 */
export async function extractAndPersistContractKnowledge(
  organizationId: string,
  contractId: string,
  sourceText: string,
  contractType: string,
  actor: Actor = { id: null, type: "AGENT" },
): Promise<ContractExtractionResult> {
  const { clauses, obligations } = extractContractKnowledge(sourceText, contractType);
  const agentActor = { id: actor.id, type: "AGENT" as const };
  const now = Date.now();
  const day = 86_400_000;

  for (const c of clauses) {
    await addClause(organizationId, contractId, c, agentActor);
  }
  for (const o of obligations) {
    await createObligation(
      organizationId,
      contractId,
      {
        description: o.description,
        dueDate: o.dueInDays != null ? new Date(now + o.dueInDays * day) : null,
        recurrence: o.recurrence,
      },
      agentActor,
    );
  }
  return { clauses: clauses.length, obligations: obligations.length };
}

export interface SpawnContractFromIntakeInput {
  organizationId: string;
  sourceIntakeTicketId: string;
  title: string;
  /** Human-facing contract type, e.g. "NDA" | "Master Services Agreement". */
  contractType: string;
  description?: string | null;
  matterId?: string | null;
  counterpartyId?: string | null;
}

export interface SpawnContractResult {
  contractId: string;
  title: string;
  clauses: number;
  obligations: number;
}

/**
 * Create a Contract from an approved intake ticket and run the shared
 * extractor over its description. Returns null if a contract already
 * exists for this ticket (idempotent) — callers treat null as "nothing
 * to do".
 */
export async function spawnContractFromIntake(
  input: SpawnContractFromIntakeInput,
  actor: Actor,
): Promise<SpawnContractResult | null> {
  const existing = await prisma.contract.findFirst({
    where: { organizationId: input.organizationId, sourceIntakeTicketId: input.sourceIntakeTicketId },
    select: { id: true },
  });
  if (existing) return null;

  const contract = await createContract(
    input.organizationId,
    {
      title: input.title,
      type: input.contractType,
      status: "IN_REVIEW",
      counterpartyId: input.counterpartyId ?? null,
      matterId: input.matterId ?? null,
      sourceIntakeTicketId: input.sourceIntakeTicketId,
    },
    { id: actor.id, type: actor.type ?? "USER" },
  );

  const ext = await extractAndPersistContractKnowledge(
    input.organizationId,
    contract.id,
    input.description ?? input.title,
    input.contractType,
    { id: actor.id, type: "AGENT" },
  );

  return { contractId: contract.id, title: input.title, clauses: ext.clauses, obligations: ext.obligations };
}
