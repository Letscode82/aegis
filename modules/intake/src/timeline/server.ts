/**
 * W1-3 · Ticket Timeline — the unified, verifiable activity feed
 * (issue #105).
 *
 * One read over the chain-sealed AuditLog for a single ticket: every
 * action (human, agent, system) in order, with resolved actor names
 * and the chain evidence (position + content hash) that makes the
 * story tamper-evident. Read-only — this surface just makes the
 * ledger visible.
 *
 * Server-only — imports @aegis/db.
 */
import { prisma } from "@aegis/db";

export interface TimelineEventDTO {
  id: string;
  action: string;
  actorType: string;
  /** Resolved User.name for USER rows; null for AGENT/SYSTEM. */
  actorName: string | null;
  at: string;
  /** Chain evidence — per-org monotonic position + content hash. */
  chainPosition: number;
  hashPrefix: string;
  /** Best-effort human detail pulled from the row's JSON payloads. */
  detail: string | null;
}

export class TimelineTicketNotFoundError extends Error {
  constructor(id: string) {
    super(`Intake ticket ${id} not found`);
    this.name = "TimelineTicketNotFoundError";
  }
}

type J = Record<string, unknown> | null;

/** Pull a one-line human detail out of the known payload shapes. */
export function extractDetail(afterJson: J, metadata: J): string | null {
  const a = afterJson ?? {};
  const m = metadata ?? {};
  const pick = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  return (
    pick((m as J)?.["ruleName"]) ??
    pick((a as J)?.["ruleName"]) ??
    pick((a as J)?.["stage"]) ??
    pick((m as J)?.["reason"]) ??
    pick((a as J)?.["holder"] ? `now held by ${String((a as J)?.["holder"])}` : null) ??
    pick((a as J)?.["name"]) ??
    null
  );
}

export async function getTicketTimeline(
  organizationId: string,
  ticketId: string,
): Promise<TimelineEventDTO[]> {
  const ticket = await prisma.intakeTicket.findFirst({
    where: { id: ticketId, organizationId },
    select: { id: true },
  });
  if (!ticket) throw new TimelineTicketNotFoundError(ticketId);

  const rows = await prisma.auditLog.findMany({
    where: { organizationId, resourceType: "IntakeTicket", resourceId: ticketId },
    orderBy: { timestamp: "asc" },
    select: {
      id: true,
      action: true,
      actorId: true,
      actorType: true,
      timestamp: true,
      chainPosition: true,
      contentHash: true,
      afterJson: true,
      metadata: true,
    },
    take: 300,
  });

  // Resolve USER actor names in one batch.
  const actorIds = Array.from(
    new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x)),
  );
  const users = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    actorType: r.actorType,
    actorName: r.actorId ? (nameById.get(r.actorId) ?? null) : null,
    at: r.timestamp.toISOString(),
    // BigInt → Number for JSON serialization (positions stay well
    // within safe-integer range).
    chainPosition: Number(r.chainPosition),
    hashPrefix: (r.contentHash || "").slice(0, 12),
    detail: extractDetail(r.afterJson as J, r.metadata as J),
  }));
}
