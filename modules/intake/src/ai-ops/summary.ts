/**
 * AI Operations summary — read-only aggregator for the dashboard panel set.
 *
 * Surfaces three views of the existing intake AI loop over the canonical
 * AuditLog ledger and AgentRecommendation table:
 *   1. recent agent activity (last N curated audit rows)
 *   2. agent scorecard (accuracy, coverage, avg review time, escalation,
 *      total events) over a 30-day window
 *   3. tickets awaiting human review (created but never triaged)
 *
 * Server-only — imports `prisma` from `@aegis/db`. Composed into one
 * top-level helper (`getAIOperationsSummary`) so the dashboard fetches
 * everything in a single round-trip.
 *
 * No new audit rows, no mutations. The classifier itself lives in
 * `@aegis/ai` and is out of scope here.
 */

import { prisma } from "@aegis/db";

// ── Curated action sets ──────────────────────────────────────────────

/** Audit actions that count as "agent activity" for the live feed. */
export const ACTIVITY_ACTIONS = [
  "intake.ticket.created",
  "intake.recommendation.approved",
  "intake.recommendation.edited_approved",
  "intake.recommendation.rejected",
  "intake.recommendation.reassigned",
  "intake.recommendation.snoozed",
  "intake.recommendation.manual_close",
  "intake.ticket.escalated",
  "intake.ticket.closed",
] as const;

/**
 * Human-review actions — anything that signals an attorney acted on
 * the AI's recommendation. Used by both the pending-review query
 * (exclude tickets that have any of these) and the accuracy metric.
 */
const HUMAN_REVIEW_ACTIONS = [
  "intake.recommendation.approved",
  "intake.recommendation.edited_approved",
  "intake.recommendation.rejected",
  "intake.recommendation.reassigned",
] as const;

// ── Result types ─────────────────────────────────────────────────────

export interface ActivityEvent {
  /** AuditLog row id — stable for React keys. */
  id: string;
  /** Canonical action name, e.g. "intake.recommendation.approved". */
  action: string;
  /** IntakeTicket id, e.g. "REQ-3501". Always populated — every action
   *  in ACTIVITY_ACTIONS resolves to a ticket. */
  ticketId: string;
  /** Short description from IntakeTicket.description, truncated. Null
   *  if the underlying ticket has been deleted. */
  ticketTitle: string | null;
  /** Intake type, e.g. "NDA Request". Null if ticket missing. */
  ticketType: string | null;
  /** Resolved display name for the actor. Falls back to "Unknown user"
   *  if the User row can't be found. */
  actorName: string;
  /** "USER" | "AGENT" | "SYSTEM" — mirrors AuditLog.actorType. */
  actorType: string;
  /** Latest AgentRecommendation.confidence for the ticket, 0..1, or
   *  null if no recommendation has been produced. */
  confidence: number | null;
  /** ISO timestamp. */
  timestamp: string;
}

export interface Scorecard {
  /** Fraction of reviewed recommendations the human accepted
   *  (approved + edited_approved) / (approved + edited_approved + rejected).
   *  Null when denominator is zero. */
  accuracy: number | null;
  /** Fraction of created tickets that have an AgentRecommendation row.
   *  Null when denominator is zero. */
  coverage: number | null;
  /** Average milliseconds between intake.ticket.created and the first
   *  human-review action on the same ticket, sampled over the last 100
   *  created tickets in window. Null when no pairs exist. */
  avgReviewTimeMs: number | null;
  /** Fraction of created tickets that were subsequently escalated.
   *  Null when denominator is zero. */
  escalationRate: number | null;
  /** Total qualifying AuditLog rows in window. */
  agentEvents: number;
}

export interface PendingReviewItem {
  ticketId: string;
  ticketType: string;
  description: string;
  requesterName: string;
  submittedAt: string;
  waitingMs: number;
  /** Latest recommendation's agentId, or null if no rec. */
  agentId: string | null;
  /** Recommendation's suggestedAction (classifier label), or null. */
  classification: string | null;
  confidence: number | null;
}

export interface AIOperationsSummary {
  activity: ActivityEvent[];
  scorecard: Scorecard;
  pendingReview: PendingReviewItem[];
  /** ISO timestamp the summary was computed at. */
  asOf: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

function thirtyDaysAgo(now: Date): Date {
  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

// ── Panel A: recent agent activity ───────────────────────────────────

export async function getRecentAgentActivity(
  organizationId: string,
  limit = 20,
): Promise<ActivityEvent[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      organizationId,
      action: { in: [...ACTIVITY_ACTIONS] },
      resourceType: "IntakeTicket",
    },
    orderBy: { timestamp: "desc" },
    take: limit,
  });
  if (rows.length === 0) return [];

  const ticketIds = Array.from(new Set(rows.map((r) => r.resourceId)));
  const actorIds = Array.from(
    new Set(rows.map((r) => r.actorId).filter((id): id is string => !!id)),
  );

  const [tickets, users, recs] = await Promise.all([
    prisma.intakeTicket.findMany({
      where: { id: { in: ticketIds }, organizationId },
      select: { id: true, description: true, type: true },
    }),
    actorIds.length
      ? prisma.user.findMany({
          where: { id: { in: actorIds }, organizationId },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
    prisma.agentRecommendation.findMany({
      where: { ticketId: { in: ticketIds } },
      orderBy: { createdAt: "desc" },
      select: { ticketId: true, confidence: true, createdAt: true },
    }),
  ]);

  const ticketById = new Map(tickets.map((t) => [t.id, t]));
  const userById = new Map(users.map((u) => [u.id, u]));
  // First match wins thanks to orderBy desc — keep the latest per ticket.
  const latestRecByTicket = new Map<string, number>();
  for (const r of recs) {
    if (!latestRecByTicket.has(r.ticketId)) {
      latestRecByTicket.set(r.ticketId, r.confidence);
    }
  }

  return rows.map((r) => {
    const ticket = ticketById.get(r.resourceId);
    const actorName =
      r.actorType === "USER" && r.actorId
        ? userById.get(r.actorId)?.name ?? "Unknown user"
        : r.actorType === "AGENT"
          ? "AEGIS Agent"
          : r.actorType === "SYSTEM"
            ? "System"
            : "Unknown";
    return {
      id: r.id,
      action: r.action,
      ticketId: r.resourceId,
      ticketTitle: ticket ? truncate(ticket.description, 80) : null,
      ticketType: ticket?.type ?? null,
      actorName,
      actorType: r.actorType,
      confidence: latestRecByTicket.get(r.resourceId) ?? null,
      timestamp: r.timestamp.toISOString(),
    };
  });
}

// ── Panel B: scorecard ───────────────────────────────────────────────

export async function getAgentScorecard(
  organizationId: string,
  now: Date = new Date(),
): Promise<Scorecard> {
  const since = thirtyDaysAgo(now);

  // One query for the action breakdown — count rows by action in window.
  const byAction = await prisma.auditLog.groupBy({
    by: ["action"],
    where: {
      organizationId,
      action: { in: [...ACTIVITY_ACTIONS] },
      timestamp: { gte: since },
    },
    _count: { _all: true },
  });
  const countOf = (a: string): number =>
    byAction.find((r) => r.action === a)?._count._all ?? 0;

  const approved = countOf("intake.recommendation.approved");
  const edited = countOf("intake.recommendation.edited_approved");
  const rejected = countOf("intake.recommendation.rejected");
  const denom = approved + edited + rejected;
  const accuracy = denom === 0 ? null : (approved + edited) / denom;

  const agentEvents = byAction.reduce((sum, r) => sum + r._count._all, 0);

  // Coverage — distinct tickets created in window with vs without any
  // AgentRecommendation row. Done via two queries to keep the join in
  // Prisma rather than raw SQL.
  const createdRows = await prisma.auditLog.findMany({
    where: {
      organizationId,
      action: "intake.ticket.created",
      timestamp: { gte: since },
    },
    select: { resourceId: true },
  });
  const createdTicketIds = Array.from(
    new Set(createdRows.map((r) => r.resourceId)),
  );
  let coverage: number | null = null;
  if (createdTicketIds.length > 0) {
    const ticketsWithRec = await prisma.agentRecommendation.findMany({
      where: { ticketId: { in: createdTicketIds } },
      distinct: ["ticketId"],
      select: { ticketId: true },
    });
    coverage = ticketsWithRec.length / createdTicketIds.length;
  }

  // Escalation rate — distinct escalated tickets / distinct created tickets.
  let escalationRate: number | null = null;
  if (createdTicketIds.length > 0) {
    const escalatedDistinct = await prisma.auditLog.findMany({
      where: {
        organizationId,
        action: "intake.ticket.escalated",
        timestamp: { gte: since },
        resourceId: { in: createdTicketIds },
      },
      distinct: ["resourceId"],
      select: { resourceId: true },
    });
    escalationRate = escalatedDistinct.length / createdTicketIds.length;
  }

  // Average review time — pair created→first human-review action on the
  // same ticket. Sample over the last 100 created rows in window.
  const recentCreated = await prisma.auditLog.findMany({
    where: {
      organizationId,
      action: "intake.ticket.created",
      timestamp: { gte: since },
    },
    orderBy: { timestamp: "desc" },
    take: 100,
    select: { resourceId: true, timestamp: true },
  });
  let avgReviewTimeMs: number | null = null;
  if (recentCreated.length > 0) {
    const sampleIds = recentCreated.map((r) => r.resourceId);
    const reviews = await prisma.auditLog.findMany({
      where: {
        organizationId,
        action: { in: [...HUMAN_REVIEW_ACTIONS] },
        resourceId: { in: sampleIds },
      },
      orderBy: { timestamp: "asc" },
      select: { resourceId: true, timestamp: true },
    });
    // Keep first review per ticket.
    const firstReviewByTicket = new Map<string, Date>();
    for (const r of reviews) {
      if (!firstReviewByTicket.has(r.resourceId)) {
        firstReviewByTicket.set(r.resourceId, r.timestamp);
      }
    }
    const deltas: number[] = [];
    for (const c of recentCreated) {
      const reviewedAt = firstReviewByTicket.get(c.resourceId);
      if (!reviewedAt) continue;
      const delta = reviewedAt.getTime() - c.timestamp.getTime();
      if (delta >= 0) deltas.push(delta);
    }
    if (deltas.length > 0) {
      avgReviewTimeMs =
        deltas.reduce((a, b) => a + b, 0) / deltas.length;
    }
  }

  return {
    accuracy,
    coverage,
    avgReviewTimeMs,
    escalationRate,
    agentEvents,
  };
}

// ── Panel C: pending human review ────────────────────────────────────

export async function getPendingReviewQueue(
  organizationId: string,
  limit = 5,
): Promise<PendingReviewItem[]> {
  // Ticket ids that have ever been created.
  const created = await prisma.auditLog.findMany({
    where: {
      organizationId,
      action: "intake.ticket.created",
    },
    distinct: ["resourceId"],
    select: { resourceId: true },
  });
  if (created.length === 0) return [];
  const createdIds = created.map((c) => c.resourceId);

  // Ticket ids that have been acted on by a human reviewer.
  const reviewed = await prisma.auditLog.findMany({
    where: {
      organizationId,
      action: { in: [...HUMAN_REVIEW_ACTIONS] },
      resourceId: { in: createdIds },
    },
    distinct: ["resourceId"],
    select: { resourceId: true },
  });
  const reviewedSet = new Set(reviewed.map((r) => r.resourceId));

  const pendingIds = createdIds.filter((id) => !reviewedSet.has(id));
  if (pendingIds.length === 0) return [];

  // Fetch ticket details, ordered by submittedAt DESC, limited.
  const tickets = await prisma.intakeTicket.findMany({
    where: { id: { in: pendingIds }, organizationId },
    orderBy: { submittedAt: "desc" },
    take: limit,
    include: {
      requester: { select: { name: true } },
      recommendations: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          agentId: true,
          confidence: true,
          suggestedAction: true,
        },
      },
    },
  });

  const now = Date.now();
  return tickets.map((t) => {
    const rec = t.recommendations[0];
    return {
      ticketId: t.id,
      ticketType: t.type,
      description: truncate(t.description, 140),
      requesterName: t.requester?.name ?? "Unknown",
      submittedAt: t.submittedAt.toISOString(),
      waitingMs: Math.max(0, now - t.submittedAt.getTime()),
      agentId: rec?.agentId ?? null,
      classification: rec?.suggestedAction ?? null,
      confidence: rec?.confidence ?? null,
    };
  });
}

// ── Composer ─────────────────────────────────────────────────────────

export async function getAIOperationsSummary(
  organizationId: string,
  now: Date = new Date(),
): Promise<AIOperationsSummary> {
  const [activity, scorecard, pendingReview] = await Promise.all([
    getRecentAgentActivity(organizationId, 20),
    getAgentScorecard(organizationId, now),
    getPendingReviewQueue(organizationId, 5),
  ]);
  return {
    activity,
    scorecard,
    pendingReview,
    asOf: now.toISOString(),
  };
}
