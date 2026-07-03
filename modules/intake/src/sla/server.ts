/**
 * P1c-lite + P3-lite — server-side SLA breach detection and the SLA
 * Operations aggregation.
 *
 * Until now SLA state was computed entirely in the browser (the
 * 30-second recompute in use-ticket-store) — nothing server-side
 * detected breaches, wrote audit rows, or escalated tickets;
 * `IntakeStatus.ESCALATED` was a dead enum value on this path.
 *
 * `evaluateSlaBreaches` is pg-boss-ready (idempotent, structured
 * result) following the 4c.5 defensibility-jobs pattern: an admin
 * HTTP trigger today, `pg-boss.schedule()` pointing at the same
 * function when the worker runtime ships.
 */
import { prisma, logAudit, IntakeStatus } from "@aegis/db";
import { buildSlaLegs } from "./legs";
import type { SlaLegsDTO } from "./legs";

const HOUR_MS = 3600 * 1000;

/** Statuses that mean "this ticket's clock is no longer running". */
const TERMINAL_STATUSES: IntakeStatus[] = [
  IntakeStatus.APPROVED,
  IntakeStatus.CLOSED,
  IntakeStatus.ESCALATED,
];

export interface SlaBreachResult {
  scanned: number;
  breached: number;
  escalatedTicketIds: string[];
  asOf: string;
}

/**
 * Escalate every open ticket whose SLA clock has run out.
 *
 * Idempotent: already-ESCALATED / closed tickets are excluded from
 * the scan, so re-running cannot double-escalate or double-audit.
 * Each breach writes two chain-sealed SYSTEM audit rows —
 * `intake.ticket.sla_breached` (detection) and
 * `intake.ticket.auto_escalated` (the status flip) — matching the
 * P1c contract in docs/intake-roadmap.md.
 */
export async function evaluateSlaBreaches(
  organizationId: string,
): Promise<SlaBreachResult> {
  const now = Date.now();
  const open = await prisma.intakeTicket.findMany({
    where: {
      organizationId,
      status: { notIn: TERMINAL_STATUSES },
      stage: { not: "complete" },
    },
    select: {
      id: true,
      status: true,
      slaHours: true,
      slaStatus: true,
      submittedAt: true,
    },
  });

  const escalated: string[] = [];
  for (const t of open) {
    const elapsedMs = now - t.submittedAt.getTime();
    if (elapsedMs <= t.slaHours * HOUR_MS) continue;

    await prisma.intakeTicket.update({
      where: { id: t.id },
      data: { status: IntakeStatus.ESCALATED, slaStatus: "Overdue" },
    });
    await logAudit({
      organizationId,
      actorId: null,
      actorType: "SYSTEM",
      action: "intake.ticket.sla_breached",
      resourceType: "IntakeTicket",
      resourceId: t.id,
      afterJson: {
        slaHours: t.slaHours,
        elapsedHours: Math.round((elapsedMs / HOUR_MS) * 10) / 10,
      },
    });
    await logAudit({
      organizationId,
      actorId: null,
      actorType: "SYSTEM",
      action: "intake.ticket.auto_escalated",
      resourceType: "IntakeTicket",
      resourceId: t.id,
      beforeJson: { status: t.status },
      afterJson: { status: IntakeStatus.ESCALATED },
    });
    escalated.push(t.id);
  }

  return {
    scanned: open.length,
    breached: escalated.length,
    escalatedTicketIds: escalated,
    asOf: new Date(now).toISOString(),
  };
}

// ── P3-lite — SLA Operations aggregation ─────────────────────────────

export interface SlaOperationsSummary {
  queue: {
    open: number;
    awaitingTriage: number;
    escalated: number;
    overdue: number;
    atRisk: number;
  };
  attorneyWorkload: Array<{
    userId: string;
    name: string;
    open: number;
    overdue: number;
    atRisk: number;
  }>;
  unassignedOpen: number;
  ruleEffectiveness: Array<{
    id: string;
    name: string;
    enabled: boolean;
    timesFired: number;
    lastFiredAt: string | null;
  }>;
  asOf: string;
}

/**
 * Executive read over existing tables — no mutations. Overdue /
 * at-risk are computed server-side from submittedAt + slaHours (the
 * stored slaStatus column lags until the next save or breach scan).
 */
export async function getSlaOperationsSummary(
  organizationId: string,
): Promise<SlaOperationsSummary> {
  const now = Date.now();
  const open = await prisma.intakeTicket.findMany({
    where: {
      organizationId,
      status: { notIn: [IntakeStatus.APPROVED, IntakeStatus.CLOSED] },
      stage: { not: "complete" },
    },
    select: {
      id: true,
      status: true,
      stage: true,
      triagedBy: true,
      slaHours: true,
      submittedAt: true,
      assignedToUserId: true,
      assignedToUser: { select: { name: true } },
    },
  });

  let awaitingTriage = 0;
  let escalated = 0;
  let overdue = 0;
  let atRisk = 0;
  let unassignedOpen = 0;
  const byAttorney = new Map<
    string,
    { name: string; open: number; overdue: number; atRisk: number }
  >();

  for (const t of open) {
    const pct = (now - t.submittedAt.getTime()) / (t.slaHours * HOUR_MS);
    const isOverdue = pct >= 1;
    const isAtRisk = !isOverdue && pct >= 0.7;
    if (isOverdue) overdue += 1;
    if (isAtRisk) atRisk += 1;
    if (t.status === IntakeStatus.ESCALATED) escalated += 1;
    if ((t.stage === "new" || t.stage === "assigned") && !t.triagedBy)
      awaitingTriage += 1;

    if (t.assignedToUserId && t.assignedToUser) {
      const entry = byAttorney.get(t.assignedToUserId) ?? {
        name: t.assignedToUser.name,
        open: 0,
        overdue: 0,
        atRisk: 0,
      };
      entry.open += 1;
      if (isOverdue) entry.overdue += 1;
      if (isAtRisk) entry.atRisk += 1;
      byAttorney.set(t.assignedToUserId, entry);
    } else {
      unassignedOpen += 1;
    }
  }

  const rules = await prisma.intakeRoutingRule.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      enabled: true,
      timesFired: true,
      lastFiredAt: true,
    },
    orderBy: { timesFired: "desc" },
  });

  return {
    queue: { open: open.length, awaitingTriage, escalated, overdue, atRisk },
    attorneyWorkload: Array.from(byAttorney.entries())
      .map(([userId, w]) => ({ userId, ...w }))
      .sort((a, b) => b.open - a.open),
    unassignedOpen,
    ruleEffectiveness: rules.map((r) => ({
      id: r.id,
      name: r.name,
      enabled: r.enabled,
      timesFired: r.timesFired,
      lastFiredAt: r.lastFiredAt?.toISOString() ?? null,
    })),
    asOf: new Date(now).toISOString(),
  };
}

// ── W2-4 · Multi-leg SLA — per-leg custody clocks for one ticket ─────

export class SlaTicketNotFoundError extends Error {
  constructor(id: string) {
    super(`Intake ticket ${id} not found`);
    this.name = "SlaTicketNotFoundError";
  }
}

/** Statuses whose leg clock has stopped (verdict reached). */
const LEG_CLOCK_STOPPED: IntakeStatus[] = [
  IntakeStatus.APPROVED,
  IntakeStatus.REJECTED,
  IntakeStatus.CLOSED,
];

/**
 * Partition one ticket's SLA window into custody legs from the
 * hand-off ledger. Read-only; the math lives in ./legs (pure).
 * Human passes get display names resolved in one batched lookup.
 */
export async function getTicketSlaLegs(
  organizationId: string,
  ticketId: string,
): Promise<SlaLegsDTO> {
  const ticket = await prisma.intakeTicket.findFirst({
    where: { id: ticketId, organizationId },
    select: {
      submittedAt: true,
      slaHours: true,
      status: true,
      triagedAt: true,
      updatedAt: true,
    },
  });
  if (!ticket) throw new SlaTicketNotFoundError(ticketId);

  const rows = await prisma.intakeTicketHandoff.findMany({
    where: { ticketId },
    orderBy: { createdAt: "asc" },
    select: { toHolder: true, toUserId: true, createdAt: true },
  });

  const userIds = Array.from(
    new Set(rows.map((r) => r.toUserId).filter((v): v is string => !!v)),
  );
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const clockStopped = LEG_CLOCK_STOPPED.includes(ticket.status);
  return buildSlaLegs({
    submittedTs: ticket.submittedAt.getTime(),
    slaHours: ticket.slaHours,
    handoffs: rows.map((r) => ({
      toHolder: r.toHolder,
      toUserId: r.toUserId,
      toUserName: r.toUserId ? (nameById.get(r.toUserId) ?? null) : null,
      atTs: r.createdAt.getTime(),
    })),
    // Best available verdict instant: the triage action's timestamp,
    // falling back to the row's last write.
    closedTs: clockStopped
      ? (ticket.triagedAt ?? ticket.updatedAt).getTime()
      : null,
    now: Date.now(),
  });
}
