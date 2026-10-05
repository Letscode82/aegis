/**
 * CW-5 — Cockpit RFI (Request For Information) round-trip.
 *
 * A triage reviewer who needs more from the requester sends an RFI; the
 * requester answers from "My requests"; triage resumes with the answer
 * attached. Event-shaped: one `IntakeRfi` row per round-trip with its own
 * OPEN → ANSWERED / CANCELLED lifecycle, independent of IntakeTicket.status
 * (a ticket with an OPEN RFI reads as "awaiting requester" without
 * overloading the status enum).
 *
 * Every transition is chain-sealed via `logAudit` (`intake.ticket.rfi_sent`
 * / `.rfi_answered` / `.rfi_cancelled`), so the review chain shows exactly
 * what was asked, by whom, what came back, and when.
 *
 * Server-only — imports `@aegis/db`. The reviewer gate lives at the route
 * (`intake:read_all_tickets`); the answer path is self-scoped here (the
 * caller must be the ticket's own requester) and the route adds
 * `intake:read_own_tickets`.
 */
import { prisma, logAudit, getCurrentUser } from "@aegis/db";

export interface RfiDTO {
  id: string;
  ticketId: string;
  status: string;
  question: string;
  askedById: string;
  askedByName: string;
  answer: string | null;
  answeredAt: string | null;
  answeredById: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type Ctx = {
  req?: { headers: Record<string, string | string[] | undefined> };
  res?: unknown;
};

export class RfiTicketNotFoundError extends Error {
  constructor(id: string) {
    super(`Intake ticket ${id} not found`);
    this.name = "RfiTicketNotFoundError";
  }
}
export class RfiNotFoundError extends Error {
  constructor(id: string) {
    super(`RFI ${id} not found`);
    this.name = "RfiNotFoundError";
  }
}
export class RfiValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RfiValidationError";
  }
}
export class RfiForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RfiForbiddenError";
  }
}

function toDTO(r: {
  id: string;
  ticketId: string;
  status: string;
  question: string;
  askedById: string;
  askedByName: string;
  answer: string | null;
  answeredAt: Date | null;
  answeredById: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): RfiDTO {
  return {
    id: r.id,
    ticketId: r.ticketId,
    status: r.status,
    question: r.question,
    askedById: r.askedById,
    askedByName: r.askedByName,
    answer: r.answer,
    answeredAt: r.answeredAt ? r.answeredAt.toISOString() : null,
    answeredById: r.answeredById,
    cancelledAt: r.cancelledAt ? r.cancelledAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const MAX_QUESTION = 2000;
const MAX_ANSWER = 5000;

/** All RFIs on a ticket, newest first (reviewer view). */
export async function listRfisForTicket(
  organizationId: string,
  ticketId: string,
): Promise<RfiDTO[]> {
  const rows = await prisma.intakeRfi.findMany({
    where: { organizationId, ticketId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDTO);
}

/** The single outstanding (OPEN) RFI on a ticket, or null. */
export async function getOpenRfiForTicket(
  organizationId: string,
  ticketId: string,
): Promise<RfiDTO | null> {
  const row = await prisma.intakeRfi.findFirst({
    where: { organizationId, ticketId, status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });
  return row ? toDTO(row) : null;
}

/**
 * Reviewer sends an RFI to the ticket's requester. At most one OPEN RFI per
 * ticket — a second send while one is outstanding is rejected (answer or
 * cancel the first).
 */
export async function sendRfi(
  organizationId: string,
  ticketId: string,
  input: { question: string },
  ctx: Ctx = {},
): Promise<RfiDTO> {
  const question = (input.question || "").trim();
  if (question.length < 3) {
    throw new RfiValidationError("Enter the question you need the requester to answer.");
  }
  if (question.length > MAX_QUESTION) {
    throw new RfiValidationError(`Question is too long (max ${MAX_QUESTION} characters).`);
  }

  const ticket = await prisma.intakeTicket.findFirst({
    where: { id: ticketId, organizationId },
    select: { id: true },
  });
  if (!ticket) throw new RfiTicketNotFoundError(ticketId);

  const existingOpen = await prisma.intakeRfi.findFirst({
    where: { organizationId, ticketId, status: "OPEN" },
    select: { id: true },
  });
  if (existingOpen) {
    throw new RfiValidationError(
      "This ticket already has an open request for information — answer or cancel it first.",
    );
  }

  const actor = await getCurrentUser(ctx.req, ctx.res);

  const created = await prisma.intakeRfi.create({
    data: {
      organizationId,
      ticketId,
      status: "OPEN",
      question,
      askedById: actor.id,
      askedByName: actor.name ?? "Reviewer",
    },
  });

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.ticket.rfi_sent",
    resourceType: "IntakeTicket",
    resourceId: ticketId,
    afterJson: { rfiId: created.id, question },
    metadata: { source: "cockpit" },
  });

  return toDTO(created);
}

/**
 * The ticket's requester answers an OPEN RFI. Self-scoped: the session
 * caller must be the requester on the ticket (matched by Person.userId, or
 * email fallback for seeded/legacy accounts). Resolving the answer flips the
 * RFI to ANSWERED and the ticket resumes triage with the answer attached.
 */
export async function answerRfi(
  organizationId: string,
  ticketId: string,
  rfiId: string,
  input: { answer: string },
  ctx: Ctx = {},
): Promise<RfiDTO> {
  const answer = (input.answer || "").trim();
  if (answer.length < 1) {
    throw new RfiValidationError("Enter your answer before submitting.");
  }
  if (answer.length > MAX_ANSWER) {
    throw new RfiValidationError(`Answer is too long (max ${MAX_ANSWER} characters).`);
  }

  const ticket = await prisma.intakeTicket.findFirst({
    where: { id: ticketId, organizationId },
    select: { id: true, requesterId: true, requester: { select: { userId: true, email: true } } },
  });
  if (!ticket) throw new RfiTicketNotFoundError(ticketId);

  const actor = await getCurrentUser(ctx.req, ctx.res);
  const isRequester =
    (ticket.requester?.userId && ticket.requester.userId === actor.id) ||
    (!!ticket.requester?.email && !!actor.email && ticket.requester.email === actor.email);
  if (!isRequester) {
    throw new RfiForbiddenError("Only the requester who filed this ticket can answer its information request.");
  }

  const rfi = await prisma.intakeRfi.findFirst({
    where: { id: rfiId, organizationId, ticketId },
  });
  if (!rfi) throw new RfiNotFoundError(rfiId);
  if (rfi.status !== "OPEN") {
    throw new RfiValidationError("This request for information is no longer open.");
  }

  const updated = await prisma.intakeRfi.update({
    where: { id: rfi.id },
    data: {
      status: "ANSWERED",
      answer,
      answeredAt: new Date(),
      answeredById: ticket.requesterId,
    },
  });

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.ticket.rfi_answered",
    resourceType: "IntakeTicket",
    resourceId: ticketId,
    beforeJson: { rfiId: rfi.id, status: "OPEN" },
    afterJson: { rfiId: rfi.id, status: "ANSWERED" },
    metadata: { source: "my-requests" },
  });

  return toDTO(updated);
}

/** Reviewer cancels an outstanding RFI (superseded / no longer needed). */
export async function cancelRfi(
  organizationId: string,
  ticketId: string,
  rfiId: string,
  ctx: Ctx = {},
): Promise<RfiDTO> {
  const rfi = await prisma.intakeRfi.findFirst({
    where: { id: rfiId, organizationId, ticketId },
  });
  if (!rfi) throw new RfiNotFoundError(rfiId);
  if (rfi.status !== "OPEN") {
    throw new RfiValidationError("Only an open request for information can be cancelled.");
  }

  const actor = await getCurrentUser(ctx.req, ctx.res);
  const updated = await prisma.intakeRfi.update({
    where: { id: rfi.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.ticket.rfi_cancelled",
    resourceType: "IntakeTicket",
    resourceId: ticketId,
    beforeJson: { rfiId: rfi.id, status: "OPEN" },
    afterJson: { rfiId: rfi.id, status: "CANCELLED" },
    metadata: { source: "cockpit" },
  });

  return toDTO(updated);
}
