/**
 * W1-1 · My Work — the personal work inbox (issue #103).
 *
 * One aggregate read per user: tickets assigned to me, tickets whose
 * hand-off baton I currently hold, my open sub-tasks, and agent
 * recommendations awaiting my review. Everything is scoped to the
 * caller (self-scoped by construction), so the route gates on the
 * lowest intake permission. SLA-aware ordering: overdue first, then
 * priority, then oldest.
 *
 * Server-only — imports @aegis/db.
 */
import { prisma, IntakeStatus } from "@aegis/db";

const OPEN_STATUSES: IntakeStatus[] = [
  IntakeStatus.AWAITING_TRIAGE,
  IntakeStatus.IN_REVIEW,
  IntakeStatus.APPROVED,
  IntakeStatus.ESCALATED,
];

export interface MyWorkTicketDTO {
  id: string;
  type: string;
  priority: string;
  status: string;
  stage: string;
  slaHours: number;
  slaStatus: string;
  workStatus: string | null;
  submittedAt: string;
  descSnippet: string;
  /** Why it's on my plate. */
  assigned: boolean;
  holding: boolean;
}

export interface MyWorkTaskDTO {
  id: string;
  ticketId: string;
  title: string;
  status: string;
  ticketType: string;
  ticketPriority: string;
}

export interface MyWorkReviewDTO {
  ticketId: string;
  agentId: string;
  createdAt: string;
  ticketType: string;
  priority: string;
  slaStatus: string;
}

export interface MyWorkDTO {
  tickets: MyWorkTicketDTO[];
  tasks: MyWorkTaskDTO[];
  reviews: MyWorkReviewDTO[];
  counts: { tickets: number; tasks: number; reviews: number; total: number };
}

const PRIORITY_RANK: Record<string, number> = {
  Critical: 0, High: 1, Medium: 2, Low: 3,
};

/** Overdue first, then priority, then oldest — the "what should I do
 *  next" order. Pure so it stays unit-testable. */
export function rankMyTickets<T extends { slaStatus: string; priority: string; submittedAt: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const ao = /overdue|breach/i.test(a.slaStatus) ? 0 : 1;
    const bo = /overdue|breach/i.test(b.slaStatus) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    const ap = PRIORITY_RANK[a.priority] ?? 9;
    const bp = PRIORITY_RANK[b.priority] ?? 9;
    if (ap !== bp) return ap - bp;
    return a.submittedAt < b.submittedAt ? -1 : 1;
  });
}

export async function getMyWork(
  organizationId: string,
  userId: string,
): Promise<MyWorkDTO> {
  const ticketSelect = {
    id: true,
    type: true,
    priority: true,
    status: true,
    stage: true,
    slaHours: true,
    slaStatus: true,
    workStatus: true,
    submittedAt: true,
    description: true,
    assignedToUserId: true,
    handoffUserId: true,
  } as const;

  const [mine, tasks, reviews] = await Promise.all([
    // Assigned to me OR baton held by me — one query, flags derived.
    prisma.intakeTicket.findMany({
      where: {
        organizationId,
        status: { in: OPEN_STATUSES },
        OR: [
          { assignedToUserId: userId },
          { handoffHolder: "human", handoffUserId: userId },
        ],
      },
      select: ticketSelect,
    }),
    prisma.intakeTicketTask.findMany({
      where: {
        assigneeUserId: userId,
        status: { not: "done" },
        ticket: { organizationId, status: { in: OPEN_STATUSES } },
      },
      select: {
        id: true,
        ticketId: true,
        title: true,
        status: true,
        ticket: { select: { type: true, priority: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.agentRecommendation.findMany({
      where: {
        status: "PENDING",
        ticket: {
          organizationId,
          status: { in: OPEN_STATUSES },
          OR: [
            { assignedToUserId: userId },
            { handoffHolder: "human", handoffUserId: userId },
          ],
        },
      },
      select: {
        ticketId: true,
        agentId: true,
        createdAt: true,
        ticket: { select: { type: true, priority: true, slaStatus: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const tickets = rankMyTickets(
    mine.map((t) => ({
      id: t.id,
      type: t.type,
      priority: t.priority,
      status: t.status as string,
      stage: t.stage,
      slaHours: t.slaHours,
      slaStatus: t.slaStatus,
      workStatus: t.workStatus,
      submittedAt: t.submittedAt.toISOString(),
      descSnippet: (t.description || "").slice(0, 110),
      assigned: t.assignedToUserId === userId,
      holding: t.handoffUserId === userId,
    })),
  );

  const taskDTOs: MyWorkTaskDTO[] = tasks.map((t) => ({
    id: t.id,
    ticketId: t.ticketId,
    title: t.title,
    status: t.status,
    ticketType: t.ticket.type,
    ticketPriority: t.ticket.priority,
  }));

  const reviewDTOs: MyWorkReviewDTO[] = reviews.map((r) => ({
    ticketId: r.ticketId,
    agentId: r.agentId,
    createdAt: r.createdAt.toISOString(),
    ticketType: r.ticket.type,
    priority: r.ticket.priority,
    slaStatus: r.ticket.slaStatus,
  }));

  return {
    tickets,
    tasks: taskDTOs,
    reviews: reviewDTOs,
    counts: {
      tickets: tickets.length,
      tasks: taskDTOs.length,
      reviews: reviewDTOs.length,
      total: tickets.length + taskDTOs.length + reviewDTOs.length,
    },
  };
}
