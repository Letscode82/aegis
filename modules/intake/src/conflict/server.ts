/**
 * W3-4 · Conflict check (issue #116) — the one-brain pitch, tangible.
 *
 * One click from a ticket's Parties panel: every intake ticket AND
 * every matter involving this counterparty / person, straight off the
 * shared entities. Because intake parties, matter parties, and matter
 * counterparties all attach to the SAME Person / Counterparty rows
 * (never re-implemented per module), "have we ever dealt with Acme"
 * is a real query, not a manual email thread.
 *
 * Linkage searched:
 *   Counterparty → IntakeTicketParty.counterpartyId,
 *                  Matter.counterpartyId
 *   Person       → IntakeTicketParty.personId,
 *                  IntakeTicket.requesterId,
 *                  MatterParty.personId
 *
 * Every check writes a chain-sealed `intake.conflict_check.run` audit
 * row — running a conflict check is itself a defensibility event
 * ("we looked, on this date, and found N engagements").
 *
 * Read-only otherwise. Server-only.
 */
import { prisma, logAudit, getCurrentUser } from "@aegis/db";

export interface ConflictTicketHit {
  id: string;
  type: string;
  status: string;
  priority: string;
  submittedAt: string;
  descSnippet: string;
  /** How the entity is linked: a party role, or "requester". */
  via: string;
}

export interface ConflictMatterHit {
  id: string;
  matterNumber: string | null;
  title: string;
  type: string;
  status: string;
  /** How the entity is linked: "counterparty" or a party role. */
  via: string;
}

export interface ConflictCheckResult {
  entity: { kind: "person" | "counterparty"; id: string; name: string };
  tickets: ConflictTicketHit[];
  matters: ConflictMatterHit[];
  checkedAt: string;
}

type Ctx = {
  req?: { headers: Record<string, string | string[] | undefined> };
  res?: unknown;
};

export class ConflictEntityNotFoundError extends Error {
  constructor(kind: string, id: string) {
    super(`${kind} ${id} not found in this organization`);
    this.name = "ConflictEntityNotFoundError";
  }
}

const SNIPPET = 70;
const snip = (s: string) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > SNIPPET ? one.slice(0, SNIPPET - 1) + "…" : one;
};

const TICKET_SELECT = {
  id: true,
  type: true,
  status: true,
  priority: true,
  submittedAt: true,
  description: true,
} as const;

type TicketRow = {
  id: string;
  type: string;
  status: string;
  priority: string;
  submittedAt: Date;
  description: string;
};

function ticketHit(t: TicketRow, via: string): ConflictTicketHit {
  return {
    id: t.id,
    type: t.type,
    status: t.status,
    priority: t.priority,
    submittedAt: t.submittedAt.toISOString(),
    descSnippet: snip(t.description),
    via,
  };
}

export async function runConflictCheck(
  organizationId: string,
  entity: { personId?: string | null; counterpartyId?: string | null },
  ctx: Ctx = {},
): Promise<ConflictCheckResult> {
  const kind = entity.counterpartyId ? "counterparty" : "person";
  const entityId = entity.counterpartyId ?? entity.personId ?? "";

  const tickets = new Map<string, ConflictTicketHit>();
  const matters = new Map<string, ConflictMatterHit>();
  let name = "";

  if (kind === "counterparty") {
    const cp = await prisma.counterparty.findFirst({
      where: { id: entityId, organizationId },
      select: { id: true, name: true },
    });
    if (!cp) throw new ConflictEntityNotFoundError("Counterparty", entityId);
    name = cp.name;

    const partyRows = await prisma.intakeTicketParty.findMany({
      where: { counterpartyId: entityId, ticket: { organizationId } },
      select: { role: true, ticket: { select: TICKET_SELECT } },
    });
    for (const p of partyRows) {
      if (!tickets.has(p.ticket.id))
        tickets.set(p.ticket.id, ticketHit(p.ticket, p.role));
    }

    const matterRows = await prisma.matter.findMany({
      where: { organizationId, counterpartyId: entityId },
      select: { id: true, matterNumber: true, title: true, type: true, status: true },
    });
    for (const m of matterRows) {
      matters.set(m.id, {
        id: m.id,
        matterNumber: m.matterNumber,
        title: m.title,
        type: String(m.type),
        status: String(m.status),
        via: "counterparty",
      });
    }
  } else {
    const person = await prisma.person.findFirst({
      where: { id: entityId, organizationId },
      select: { id: true, name: true },
    });
    if (!person) throw new ConflictEntityNotFoundError("Person", entityId);
    name = person.name;

    const partyRows = await prisma.intakeTicketParty.findMany({
      where: { personId: entityId, ticket: { organizationId } },
      select: { role: true, ticket: { select: TICKET_SELECT } },
    });
    for (const p of partyRows) {
      if (!tickets.has(p.ticket.id))
        tickets.set(p.ticket.id, ticketHit(p.ticket, p.role));
    }

    const requested = await prisma.intakeTicket.findMany({
      where: { organizationId, requesterId: entityId },
      select: TICKET_SELECT,
      orderBy: { submittedAt: "desc" },
      take: 50,
    });
    for (const t of requested) {
      if (!tickets.has(t.id)) tickets.set(t.id, ticketHit(t, "requester"));
    }

    const matterParties = await prisma.matterParty.findMany({
      where: { personId: entityId, matter: { organizationId } },
      select: {
        role: true,
        matter: {
          select: { id: true, matterNumber: true, title: true, type: true, status: true },
        },
      },
    });
    for (const mp of matterParties) {
      if (!matters.has(mp.matter.id)) {
        matters.set(mp.matter.id, {
          id: mp.matter.id,
          matterNumber: mp.matter.matterNumber,
          title: mp.matter.title,
          type: String(mp.matter.type),
          status: String(mp.matter.status),
          via: String(mp.role),
        });
      }
    }
  }

  const result: ConflictCheckResult = {
    entity: { kind, id: entityId, name },
    tickets: Array.from(tickets.values()).sort((a, b) =>
      b.submittedAt.localeCompare(a.submittedAt),
    ),
    matters: Array.from(matters.values()),
    checkedAt: new Date().toISOString(),
  };

  // The check itself is evidence: who looked, when, what they found.
  const actor = await getCurrentUser(ctx.req, ctx.res);
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.conflict_check.run",
    resourceType: kind === "counterparty" ? "Counterparty" : "Person",
    resourceId: entityId,
    afterJson: {
      entityName: name,
      ticketHits: result.tickets.length,
      matterHits: result.matters.length,
    },
  });

  return result;
}
