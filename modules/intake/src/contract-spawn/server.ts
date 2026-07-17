/**
 * Intake → Contract spawn (CTR-2).
 *
 * When an attorney approves a contract-bearing intake ticket (Contract
 * Review, NDA Request), this module creates the corresponding `Contract`
 * row through `@aegis/contracts` and runs the shared contract extractor
 * over the request text to seed clauses + obligations. It is the exact
 * mirror of `matter-spawn/server.ts`: the contract flow that begins in
 * intake feeds the same system of record the Contracts module owns —
 * "the contract agent works in CLM and both are the same."
 *
 * A Contract Review ticket typically spawns BOTH a Matter (the
 * engagement, via matter-spawn) AND a Contract (the paper, here). The
 * Contract links back to that matter via `Contract.matterId` when the
 * matter-spawn ran first in the same save. NDA Request spawns only a
 * Contract — standard NDAs are paper without a matter-scoped engagement.
 *
 * Server-only. Called from the intake `saveTicketsV8` chokepoint right
 * after matter-spawn, gated on the AgentDecision being APPROVED. Spawn
 * failures don't roll back the approval — they surface as their own
 * audit event. Idempotent: `@aegis/contracts.spawnContractFromIntake`
 * returns null when a contract already exists for the ticket.
 */
import { prisma, logAudit } from "@aegis/db";
import { spawnContractFromIntake, type SpawnContractResult } from "@aegis/contracts";

/** Intake types that produce a contract. Q&A / advisory types do not. */
const CONTRACT_INTAKE_TYPES = new Set(["Contract Review", "NDA Request"]);

export function intakeTypeSpawnsContract(intakeType: string | null | undefined): boolean {
  return !!intakeType && CONTRACT_INTAKE_TYPES.has(intakeType);
}

/**
 * Derive a human-facing contract type from the intake type + description.
 * NDA Request is always an NDA; Contract Review inspects the text for a
 * recognisable instrument, defaulting to a generic "Contract".
 */
export function deriveContractType(intakeType: string, description: string | null | undefined): string {
  if (intakeType === "NDA Request") return "NDA";
  const d = (description ?? "").toLowerCase();
  if (/\bnda\b|non.?disclosure/.test(d)) return "NDA";
  if (/master services|\bmsa\b/.test(d)) return "Master Services Agreement";
  if (/statement of work|\bsow\b/.test(d)) return "Statement of Work";
  if (/licens/.test(d)) return "License Agreement";
  if (/supply|purchase|procurement/.test(d)) return "Supply Agreement";
  if (/data processing|\bdpa\b/.test(d)) return "Data Processing Addendum";
  if (/reseller|partner|channel/.test(d)) return "Partner Agreement";
  return "Contract";
}

/** One-line contract title from the ticket description (first sentence). */
export function deriveContractTitle(input: {
  type: string;
  description: string | null | undefined;
  requesterName: string | null | undefined;
}): string {
  const desc = (input.description ?? "").trim();
  if (desc) {
    const firstSentence = desc.split(/[.!?\n]/)[0]?.trim();
    if (firstSentence) {
      return firstSentence.length > 80 ? `${firstSentence.slice(0, 77)}...` : firstSentence;
    }
  }
  return `${input.type} — ${input.requesterName ?? "Unknown requester"}`;
}

interface SpawnActor {
  id: string;
  organizationId: string;
  email?: string;
  name?: string;
}

/**
 * Spawn a Contract for a freshly-approved contract-bearing intake ticket.
 * Returns null (no audit) when the type isn't contract-bearing or a
 * contract already exists for the ticket. On success writes a chain-
 * sealed `intake.ticket.contract_spawned` row so the intake timeline
 * carries the cross-module event.
 */
export async function maybeSpawnContractForApprovedTicket(
  ticket: {
    id: string;
    type: string;
    description: string | null;
    matterId: string | null;
    organizationId: string;
    requesterName?: string | null;
  },
  actor: SpawnActor,
): Promise<SpawnContractResult | null> {
  if (!intakeTypeSpawnsContract(ticket.type)) return null;

  const contractType = deriveContractType(ticket.type, ticket.description);
  const title = deriveContractTitle({
    type: ticket.type,
    description: ticket.description,
    requesterName: ticket.requesterName ?? null,
  });

  // Resolve the freshest matterId — matter-spawn may have set it earlier
  // in this same save without updating our in-memory copy.
  let matterId = ticket.matterId;
  if (!matterId) {
    const row = await prisma.intakeTicket.findUnique({ where: { id: ticket.id }, select: { matterId: true } });
    matterId = row?.matterId ?? null;
  }

  const result = await spawnContractFromIntake(
    {
      organizationId: ticket.organizationId,
      sourceIntakeTicketId: ticket.id,
      title,
      contractType,
      description: ticket.description,
      matterId,
    },
    { id: actor.id, type: "USER" },
  );
  if (!result) return null;

  await logAudit({
    organizationId: ticket.organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.ticket.contract_spawned",
    resourceType: "IntakeTicket",
    resourceId: ticket.id,
    afterJson: {
      contractId: result.contractId,
      contractType,
      matterId,
      clausesExtracted: result.clauses,
      obligationsExtracted: result.obligations,
    },
    metadata: { intakeType: ticket.type, source: "intake-storage-api" },
  });

  return result;
}
