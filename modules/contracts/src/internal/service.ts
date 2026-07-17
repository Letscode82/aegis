/**
 * Contract lifecycle + obligation + clause mutations (server-only,
 * chain-sealed).
 *
 * Every state change writes a chain-sealed AuditLog row (Differentiator
 * #3). Obligations use the SHARED Obligation entity (sourceType =
 * CONTRACT) — this module never invents a ContractObligation table.
 * Clauses are the one contract-specific shape (ContractClause) because a
 * clause-vs-playbook deviation is not a cross-cutting commitment the way
 * an Obligation is; they are written here so both the seed and the CTR-2
 * contract agent share one extraction path.
 */
import { prisma, logAudit } from "@aegis/db";
import type {
  ContractStatus,
  ContractRisk,
  ObligationStatus,
} from "@aegis/db";

export interface CreateContractInput {
  title: string;
  type: string;
  status?: ContractStatus;
  risk?: ContractRisk;
  value?: number | null;
  currency?: string;
  counterpartyId?: string | null;
  matterId?: string | null;
  effectiveDate?: Date | null;
  expiryDate?: Date | null;
  autoRenew?: boolean;
  noticeWindowDays?: number | null;
  governingLaw?: string | null;
  sourceIntakeTicketId?: string | null;
}

export interface CreateClauseInput {
  type: string;
  text: string;
  summary?: string | null;
  risk?: ContractRisk;
  deviation?: boolean;
}

export interface CreateObligationInput {
  description: string;
  dueDate?: Date | null;
  recurrence?: string | null;
  ownerId?: string | null;
}

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

const actorFields = (actor: Actor) => ({
  actorId: actor.id,
  actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
});

/** Create a contract row and chain-seal the create. */
export async function createContract(organizationId: string, input: CreateContractInput, actor: Actor) {
  const contract = await prisma.contract.create({
    data: {
      organizationId,
      title: input.title,
      type: input.type,
      status: input.status ?? "DRAFT",
      risk: input.risk ?? "MEDIUM",
      value: input.value ?? null,
      currency: input.currency ?? "USD",
      counterpartyId: input.counterpartyId ?? null,
      matterId: input.matterId ?? null,
      effectiveDate: input.effectiveDate ?? null,
      expiryDate: input.expiryDate ?? null,
      autoRenew: input.autoRenew ?? false,
      noticeWindowDays: input.noticeWindowDays ?? null,
      governingLaw: input.governingLaw ?? null,
      sourceIntakeTicketId: input.sourceIntakeTicketId ?? null,
    },
  });
  await logAudit({
    organizationId,
    ...actorFields(actor),
    action: "contract.created",
    resourceType: "Contract",
    resourceId: contract.id,
    afterJson: {
      title: contract.title,
      type: contract.type,
      status: contract.status,
      counterpartyId: contract.counterpartyId,
      matterId: contract.matterId,
      sourceIntakeTicketId: contract.sourceIntakeTicketId,
    } as never,
    metadata: { source: "contracts" } as never,
  });
  return contract;
}

/** Move a contract through its lifecycle; chain-seals the transition. */
export async function updateContractStatus(
  organizationId: string,
  contractId: string,
  status: ContractStatus,
  actor: Actor,
) {
  const existing = await prisma.contract.findFirst({ where: { id: contractId, organizationId } });
  if (!existing) throw new Error("Contract not found");
  if (existing.status === status) return existing;
  const updated = await prisma.contract.update({ where: { id: contractId }, data: { status } });
  await logAudit({
    organizationId,
    ...actorFields(actor),
    action: "contract.status_changed",
    resourceType: "Contract",
    resourceId: contractId,
    beforeJson: { status: existing.status } as never,
    afterJson: { status } as never,
    metadata: { source: "contracts" } as never,
  });
  return updated;
}

/**
 * Attach an extracted clause to a contract. Shared by the seed and the
 * CTR-2 contract agent (which passes actor.type = "AGENT"). Chain-sealed
 * so every clause the agent surfaces is on the ledger.
 */
export async function addClause(organizationId: string, contractId: string, input: CreateClauseInput, actor: Actor) {
  const contract = await prisma.contract.findFirst({ where: { id: contractId, organizationId }, select: { id: true } });
  if (!contract) throw new Error("Contract not found");
  const clause = await prisma.contractClause.create({
    data: {
      contractId,
      type: input.type,
      text: input.text,
      summary: input.summary ?? null,
      risk: input.risk ?? "LOW",
      deviation: input.deviation ?? false,
    },
  });
  await logAudit({
    organizationId,
    ...actorFields(actor),
    action: "contract.clause.extracted",
    resourceType: "ContractClause",
    resourceId: clause.id,
    afterJson: { contractId, type: clause.type, risk: clause.risk, deviation: clause.deviation } as never,
    metadata: { source: "contracts" } as never,
  });
  return clause;
}

/**
 * Record a contract commitment as a SHARED Obligation
 * (sourceType=CONTRACT, sourceId=contract.id). This is the obligation-
 * management spine — key dates, renewal windows, and deliverables all
 * land here so Company Brain (and Regulatory, Privacy, Governance) query
 * one obligation surface, not a per-module table.
 */
export async function createObligation(
  organizationId: string,
  contractId: string,
  input: CreateObligationInput,
  actor: Actor,
) {
  const contract = await prisma.contract.findFirst({ where: { id: contractId, organizationId }, select: { id: true } });
  if (!contract) throw new Error("Contract not found");
  const obligation = await prisma.obligation.create({
    data: {
      organizationId,
      sourceType: "CONTRACT",
      sourceId: contractId,
      description: input.description,
      dueDate: input.dueDate ?? null,
      recurrence: input.recurrence ?? null,
      ownerId: input.ownerId ?? null,
      status: "OPEN",
    },
  });
  await logAudit({
    organizationId,
    ...actorFields(actor),
    action: "contract.obligation.created",
    resourceType: "Obligation",
    resourceId: obligation.id,
    afterJson: {
      contractId,
      description: obligation.description,
      dueDate: obligation.dueDate?.toISOString() ?? null,
      ownerId: obligation.ownerId,
    } as never,
    metadata: { source: "contracts" } as never,
  });
  return obligation;
}

/** Transition an obligation's status; chain-sealed. Only obligations
 *  sourced from a contract in this org can be moved through this surface. */
export async function updateObligationStatus(
  organizationId: string,
  obligationId: string,
  status: ObligationStatus,
  actor: Actor,
) {
  const existing = await prisma.obligation.findFirst({
    where: { id: obligationId, organizationId, sourceType: "CONTRACT" },
  });
  if (!existing) throw new Error("Contract obligation not found");
  if (existing.status === status) return existing;
  const updated = await prisma.obligation.update({ where: { id: obligationId }, data: { status } });
  await logAudit({
    organizationId,
    ...actorFields(actor),
    action: "contract.obligation.status_changed",
    resourceType: "Obligation",
    resourceId: obligationId,
    beforeJson: { status: existing.status } as never,
    afterJson: { status, contractId: existing.sourceId } as never,
    metadata: { source: "contracts" } as never,
  });
  return updated;
}

/** Convenience: mark an obligation MET. */
export function completeObligation(organizationId: string, obligationId: string, actor: Actor) {
  return updateObligationStatus(organizationId, obligationId, "MET", actor);
}
