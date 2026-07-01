/**
 * Item 6 (agent ↔ human hand-off) — persistence + audit for baton passes.
 *
 * The ticket never leaves the platform; a hand-off records who now holds
 * it and why. The append-only IntakeTicketHandoff log is the source of
 * truth; IntakeTicket.handoffHolder / handoffUserId are the fast-read
 * materialization. Every pass writes a chain-sealed AuditLog row
 * (`intake.ticket.handoff`) so the review chain is defensible.
 *
 * Builds on the existing assignment + AgentDecision surfaces: a hand-off
 * to a human can also mirror the concrete owner onto `assignedToUserId`
 * (keeping tiering consistent), and an agent→human review gate can link
 * the governing AgentDecision.
 *
 * Server-only — imports @aegis/db.
 */
import { prisma, logAudit, getCurrentUser } from "@aegis/db";
import { validateHandoff, isHandoffHolder } from "./state";
import type { HandoffHolder } from "./state";

export interface HandoffEventDTO {
  id: string;
  fromHolder: string | null;
  toHolder: string;
  toUserId: string | null;
  reason: string | null;
  actorId: string | null;
  actorType: string;
  agentDecisionId: string | null;
  createdAt: string;
}

export interface HandoffStateDTO {
  ticketId: string;
  holder: string | null;
  holderUserId: string | null;
  updatedAt: string | null;
  history: HandoffEventDTO[];
}

type Ctx = {
  req?: { headers: Record<string, string | string[] | undefined> };
  res?: unknown;
};

export class HandoffTicketNotFoundError extends Error {
  constructor(id: string) {
    super(`Intake ticket ${id} not found`);
    this.name = "HandoffTicketNotFoundError";
  }
}

export class HandoffValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HandoffValidationError";
  }
}

function toEventDTO(r: {
  id: string;
  fromHolder: string | null;
  toHolder: string;
  toUserId: string | null;
  reason: string | null;
  actorId: string | null;
  actorType: string;
  agentDecisionId: string | null;
  createdAt: Date;
}): HandoffEventDTO {
  return {
    id: r.id,
    fromHolder: r.fromHolder,
    toHolder: r.toHolder,
    toUserId: r.toUserId,
    reason: r.reason,
    actorId: r.actorId,
    actorType: r.actorType,
    agentDecisionId: r.agentDecisionId,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Current baton + full pass history (newest first). */
export async function getHandoffState(
  organizationId: string,
  ticketId: string,
): Promise<HandoffStateDTO> {
  const ticket = await prisma.intakeTicket.findFirst({
    where: { id: ticketId, organizationId },
    select: { id: true, handoffHolder: true, handoffUserId: true, handoffUpdatedAt: true },
  });
  if (!ticket) throw new HandoffTicketNotFoundError(ticketId);
  const history = await prisma.intakeTicketHandoff.findMany({
    where: { ticketId },
    orderBy: { createdAt: "desc" },
  });
  return {
    ticketId,
    holder: ticket.handoffHolder,
    holderUserId: ticket.handoffUserId,
    updatedAt: ticket.handoffUpdatedAt?.toISOString() ?? null,
    history: history.map(toEventDTO),
  };
}

export interface HandoffInput {
  toHolder: HandoffHolder | string;
  /** Required when toHolder="human". */
  toUserId?: string | null;
  reason?: string | null;
  /** Links the AgentDecision governing an agent→human review gate. */
  agentDecisionId?: string | null;
  /** When true (default), mirror a human holder onto assignedToUserId. */
  syncAssignee?: boolean;
}

/**
 * Perform a hand-off. Validates the baton-pass against the pure state
 * machine, appends an IntakeTicketHandoff row, updates the denormalized
 * holder on the ticket, and writes a chain-sealed AuditLog row. When the
 * baton goes to a named human, the concrete owner is mirrored onto
 * `assignedToUserId` unless `syncAssignee` is false.
 */
export async function handOff(
  organizationId: string,
  ticketId: string,
  input: HandoffInput,
  ctx: Ctx = {},
): Promise<HandoffStateDTO> {
  const ticket = await prisma.intakeTicket.findFirst({
    where: { id: ticketId, organizationId },
    select: {
      id: true,
      handoffHolder: true,
      handoffUserId: true,
      assignedToUserId: true,
    },
  });
  if (!ticket) throw new HandoffTicketNotFoundError(ticketId);

  const toHolder = input.toHolder;
  if (!isHandoffHolder(toHolder)) {
    throw new HandoffValidationError(
      `toHolder must be one of agent, human, queue (got "${toHolder}")`,
    );
  }
  const toUserId = input.toUserId?.trim() || null;

  const decision = validateHandoff({
    fromHolder: isHandoffHolder(ticket.handoffHolder) ? ticket.handoffHolder : null,
    toHolder,
    fromUserId: ticket.handoffUserId,
    toUserId,
  });
  if (!decision.ok) throw new HandoffValidationError(decision.reason);

  // Validate the receiving human belongs to the org.
  if (toHolder === "human" && toUserId) {
    const user = await prisma.user.findFirst({
      where: { id: toUserId, organizationId },
      select: { id: true },
    });
    if (!user) {
      throw new HandoffValidationError("Assignee not found in this organization");
    }
  }
  // Validate the linked decision, if any, belongs to the org.
  if (input.agentDecisionId) {
    const dec = await prisma.agentDecision.findFirst({
      where: { id: input.agentDecisionId, organizationId },
      select: { id: true },
    });
    if (!dec) {
      throw new HandoffValidationError("Linked agent decision not found in this organization");
    }
  }

  const actor = await getCurrentUser(ctx.req, ctx.res);
  const now = new Date();
  const syncAssignee = input.syncAssignee !== false;

  await prisma.$transaction(async (tx) => {
    await tx.intakeTicketHandoff.create({
      data: {
        ticketId,
        fromHolder: ticket.handoffHolder ?? null,
        toHolder,
        toUserId,
        reason: input.reason?.trim() || null,
        actorId: actor.id,
        actorType: "USER",
        agentDecisionId: input.agentDecisionId ?? null,
      },
    });
    await tx.intakeTicket.update({
      where: { id: ticketId },
      data: {
        handoffHolder: toHolder,
        handoffUserId: toHolder === "human" ? toUserId : null,
        handoffUpdatedAt: now,
        // Mirror a human baton onto the primary assignee for tier
        // consistency; agent/queue passes leave the assignee untouched.
        ...(syncAssignee && toHolder === "human" && toUserId
          ? { assignedToUserId: toUserId }
          : {}),
      },
    });
  });

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.ticket.handoff",
    resourceType: "IntakeTicket",
    resourceId: ticketId,
    beforeJson: { holder: ticket.handoffHolder, holderUserId: ticket.handoffUserId },
    afterJson: { holder: toHolder, holderUserId: toHolder === "human" ? toUserId : null },
    metadata: {
      reason: input.reason?.trim() || null,
      agentDecisionId: input.agentDecisionId ?? null,
    },
  });

  return getHandoffState(organizationId, ticketId);
}
