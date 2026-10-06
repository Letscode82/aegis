/**
 * W3-1 · Microsoft Teams intake channel (issue #113) — dispatch.
 *
 * One entry point: `handleTeamsActivity(activity)` — parses the
 * command out of the mention text and either files a ticket (the same
 * P4a ingest path as email: classify → route → persist → audit, source
 * TEAMS) or answers a status query. Returns the reply Activity the
 * webhook route sends back to the channel.
 *
 * Idempotent on the Teams message id (Teams retries webhooks): a
 * redelivery resolves to the existing ticket. Server-only.
 */
import { prisma, IntakeSource, getCurrentOrganization } from "@aegis/db";
import {
  ingestInboundEmail,
  type EmailTriageRunner,
  type IngestEmailResult,
  type InboundEmail,
  type IngestOptions,
} from "../email/server";
import {
  parseTeamsCommand,
  subjectFromText,
  buildHelpReply,
  buildFiledReply,
  buildStatusReply,
  buildStatusListReply,
  buildNotFoundReply,
  buildErrorReply,
} from "./protocol";
import type { TeamsActivity, TeamsReply, TicketStatusLine } from "./protocol";

export type { TeamsActivity, TeamsReply } from "./protocol";
export { verifyTeamsHmac, parseTeamsCommand, stripMentions } from "./protocol";

const SNIPPET_LEN = 70;

function snippet(desc: string): string {
  const oneLine = desc.replace(/\s+/g, " ").trim();
  return oneLine.length > SNIPPET_LEN
    ? oneLine.slice(0, SNIPPET_LEN - 1) + "…"
    : oneLine;
}

function toStatusLine(t: {
  id: string;
  status: string;
  stage: string;
  priority: string;
  assignedTo: string | null;
  slaStatus: string | null;
  description: string;
}): TicketStatusLine {
  return {
    id: t.id,
    status: t.status,
    stage: t.stage,
    priority: t.priority,
    assignedTo: t.assignedTo,
    slaStatus: t.slaStatus,
    descSnippet: snippet(t.description),
  };
}

/** Test seam — inject the ingest + org resolution. */
export interface TeamsHandlerOptions {
  organizationId?: string;
  triage?: EmailTriageRunner;
  ingest?: (
    email: InboundEmail,
    opts: IngestOptions,
  ) => Promise<IngestEmailResult>;
}

export async function handleTeamsActivity(
  activity: TeamsActivity,
  opts: TeamsHandlerOptions = {},
): Promise<TeamsReply> {
  const fromName = activity.from?.name?.trim() || "Teams User";
  const command = parseTeamsCommand(activity.text ?? "");

  if (command.kind === "help") return buildHelpReply();

  if (command.kind === "status") {
    const orgId =
      opts.organizationId ?? (await getCurrentOrganization()).id;

    if (command.ticketId) {
      const t = await prisma.intakeTicket.findFirst({
        where: { id: command.ticketId, organizationId: orgId },
        select: {
          id: true,
          status: true,
          stage: true,
          priority: true,
          assignedTo: true,
          slaStatus: true,
          description: true,
        },
      });
      if (!t) return buildNotFoundReply(command.ticketId);
      return buildStatusReply(toStatusLine(t));
    }

    // Bare `status` — the sender's recent tickets, matched by requester
    // name (Teams outgoing webhooks don't carry an email address).
    const rows = await prisma.intakeTicket.findMany({
      where: { organizationId: orgId, requester: { name: fromName } },
      orderBy: { submittedAt: "desc" },
      take: 5,
      select: {
        id: true,
        status: true,
        stage: true,
        priority: true,
        assignedTo: true,
        slaStatus: true,
        description: true,
      },
    });
    return buildStatusListReply(fromName, rows.map(toStatusLine));
  }

  // File a request — same pipeline as the email channel, source TEAMS.
  const channelNote = [
    activity.channelData?.team?.name,
    activity.channelData?.channel?.name,
  ]
    .filter(Boolean)
    .join(" › ");
  try {
    const ingest = opts.ingest ?? ingestInboundEmail;
    const result = await ingest(
      {
        from: fromName,
        subject: subjectFromText(command.text),
        body:
          command.text +
          (channelNote ? `\n\n[Filed from Teams: ${channelNote}]` : ""),
        threadId: activity.conversation?.id,
        messageId: activity.id ? `teams:${activity.id}` : undefined,
      },
      {
        ...(opts.organizationId
          ? { organizationId: opts.organizationId }
          : {}),
        ...(opts.triage ? { triage: opts.triage } : {}),
        source: IntakeSource.TEAMS,
      },
    );
    return buildFiledReply(result);
  } catch {
    return buildErrorReply();
  }
}
