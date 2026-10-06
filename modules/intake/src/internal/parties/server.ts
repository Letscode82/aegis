/**
 * Intake ticket parties (Phase 1 — people/entities involved).
 *
 * Records who is involved in a ticket by linking the SHARED entities
 * (Person / Counterparty) with a role — the adverse party, opposing / our
 * counsel, witnesses, etc. Reuses the one-brain entities rather than a
 * ticket-local party table, so "every ticket involving Acme" is a real
 * query. Litigation intake (item 4) populates these.
 *
 * Exactly one of personId / counterpartyId per party. Org-scoped via the
 * ticket; every mutation audited. Server-only.
 */
import { prisma, logAudit, getCurrentUser } from "@aegis/db";

export const PARTY_ROLES = [
  "adverse_party",
  "opposing_counsel",
  "our_counsel",
  "witness",
  "requester",
  "third_party",
  "other",
] as const;

export interface PartyDTO {
  id: string;
  kind: "person" | "counterparty";
  personId: string | null;
  counterpartyId: string | null;
  /** Resolved display name of the linked entity. */
  name: string | null;
  role: string;
  note: string | null;
  createdAt: string;
}

type Ctx = {
  req?: { headers: Record<string, string | string[] | undefined> };
  res?: unknown;
};

export class TicketNotFoundError extends Error {
  constructor(id: string) {
    super(`Intake ticket ${id} not found`);
    this.name = "TicketNotFoundError";
  }
}
export class PartyNotFoundError extends Error {
  constructor(id: string) {
    super(`Intake ticket party ${id} not found`);
    this.name = "PartyNotFoundError";
  }
}
export class PartyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PartyValidationError";
  }
}

async function requireTicket(organizationId: string, ticketId: string) {
  const t = await prisma.intakeTicket.findFirst({
    where: { id: ticketId, organizationId },
    select: { id: true },
  });
  if (!t) throw new TicketNotFoundError(ticketId);
}

type PartyRow = {
  id: string;
  personId: string | null;
  counterpartyId: string | null;
  role: string;
  note: string | null;
  createdAt: Date;
  person: { name: string } | null;
  counterparty: { name: string } | null;
};

function toDTO(r: PartyRow): PartyDTO {
  const kind: "person" | "counterparty" = r.counterpartyId ? "counterparty" : "person";
  return {
    id: r.id,
    kind,
    personId: r.personId,
    counterpartyId: r.counterpartyId,
    name: r.person?.name ?? r.counterparty?.name ?? null,
    role: r.role,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  };
}

const INCLUDE = { person: { select: { name: true } }, counterparty: { select: { name: true } } } as const;

export async function listParties(
  organizationId: string,
  ticketId: string,
): Promise<PartyDTO[]> {
  await requireTicket(organizationId, ticketId);
  const rows = await prisma.intakeTicketParty.findMany({
    where: { ticketId },
    include: INCLUDE,
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => toDTO(r as PartyRow));
}

export interface PartyInput {
  personId?: string | null;
  counterpartyId?: string | null;
  role?: string;
  note?: string | null;
}

export async function addParty(
  organizationId: string,
  ticketId: string,
  input: PartyInput,
  ctx: Ctx = {},
): Promise<PartyDTO> {
  await requireTicket(organizationId, ticketId);
  const personId = input.personId?.trim() || null;
  const counterpartyId = input.counterpartyId?.trim() || null;
  if (!personId === !counterpartyId) {
    throw new PartyValidationError("Provide exactly one of personId or counterpartyId.");
  }
  const role = (input.role ?? "other").trim() || "other";

  // The referenced entity must belong to the same org (one-brain integrity).
  if (personId) {
    const p = await prisma.person.findFirst({ where: { id: personId, organizationId }, select: { id: true } });
    if (!p) throw new PartyValidationError(`Person ${personId} not found in this organization.`);
  } else if (counterpartyId) {
    const c = await prisma.counterparty.findFirst({ where: { id: counterpartyId, organizationId }, select: { id: true } });
    if (!c) throw new PartyValidationError(`Counterparty ${counterpartyId} not found in this organization.`);
  }

  const created = await prisma.intakeTicketParty.create({
    data: { ticketId, personId, counterpartyId, role, note: input.note?.trim() || null },
    include: INCLUDE,
  });
  const actor = await getCurrentUser(ctx.req, ctx.res);
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.ticket.party_added",
    resourceType: "IntakeTicket",
    resourceId: ticketId,
    afterJson: { partyId: created.id, personId, counterpartyId, role },
  });
  return toDTO(created as PartyRow);
}

export async function updateParty(
  organizationId: string,
  partyId: string,
  patch: { role?: string; note?: string | null },
  ctx: Ctx = {},
): Promise<PartyDTO> {
  const before = await prisma.intakeTicketParty.findFirst({
    where: { id: partyId, ticket: { organizationId } },
    select: { id: true, ticketId: true, role: true },
  });
  if (!before) throw new PartyNotFoundError(partyId);
  const data: Record<string, unknown> = {};
  if (patch.role !== undefined) data.role = patch.role.trim() || "other";
  if (patch.note !== undefined) data.note = patch.note?.trim() || null;
  const updated = await prisma.intakeTicketParty.update({
    where: { id: partyId },
    data,
    include: INCLUDE,
  });
  const actor = await getCurrentUser(ctx.req, ctx.res);
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.ticket.party_updated",
    resourceType: "IntakeTicket",
    resourceId: before.ticketId,
    beforeJson: { partyId, role: before.role },
    afterJson: { partyId, role: updated.role },
  });
  return toDTO(updated as PartyRow);
}

export async function removeParty(
  organizationId: string,
  partyId: string,
  ctx: Ctx = {},
): Promise<void> {
  const before = await prisma.intakeTicketParty.findFirst({
    where: { id: partyId, ticket: { organizationId } },
    select: { id: true, ticketId: true, personId: true, counterpartyId: true, role: true },
  });
  if (!before) throw new PartyNotFoundError(partyId);
  await prisma.intakeTicketParty.delete({ where: { id: partyId } });
  const actor = await getCurrentUser(ctx.req, ctx.res);
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.ticket.party_removed",
    resourceType: "IntakeTicket",
    resourceId: before.ticketId,
    beforeJson: { partyId, personId: before.personId, counterpartyId: before.counterpartyId, role: before.role },
  });
}

export interface PartyCandidatesDTO {
  persons: Array<{ id: string; name: string; email: string | null }>;
  counterparties: Array<{ id: string; name: string; type: string | null }>;
}

/**
 * Candidate shared entities for the add-party picker — the org's Persons
 * and Counterparties. Read-only; capped so the picker stays snappy.
 * Optional `q` filters by name substring (case-insensitive).
 */
export async function listPartyCandidates(
  organizationId: string,
  q?: string,
): Promise<PartyCandidatesDTO> {
  const nameFilter = q && q.trim() ? { contains: q.trim(), mode: "insensitive" as const } : undefined;
  const [persons, counterparties] = await Promise.all([
    prisma.person.findMany({
      where: { organizationId, ...(nameFilter ? { name: nameFilter } : {}) },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    prisma.counterparty.findMany({
      where: { organizationId, ...(nameFilter ? { name: nameFilter } : {}) },
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);
  return {
    persons: persons.map((p) => ({ id: p.id, name: p.name, email: p.email ?? null })),
    counterparties: counterparties.map((c) => ({ id: c.id, name: c.name, type: (c.type as string | null) ?? null })),
  };
}
