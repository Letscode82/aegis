/**
 * Email channel ingest (Intake P4a — stub-first).
 *
 * Turns an inbound email into an IntakeTicket on the same pipeline as
 * the FORM / COPILOT channels: classify → route → persist → audit.
 *
 * Deliberately M365-free. The transport is a plain JSON webhook
 * (`POST /api/intake/email-webhook`) accepting `{from, subject, body,
 * ...}`, so the channel is demoable with curl today. P4b swaps the
 * transport for real Microsoft Graph mailbox polling — it calls THIS
 * same function, so the ingest path never changes.
 *
 * What runs here (server-side, synchronous):
 *   1. classifyIntakeRegex — deterministic type / priority / SLA.
 *   2. routing rules — the same engine saveTicketsV8 uses.
 *   3. requester Person resolution / auto-create (dev fallback pattern).
 *   4. chain-sealed AuditLog (intake.ticket.created, SYSTEM actor +
 *      one row per fired routing rule).
 *
 * What does NOT run here: the Claude agents. They live client-side
 * (they POST to the relative `/api/claude` proxy, which only resolves in
 * the browser). An email ticket lands in the Cockpit queue as
 * AWAITING_TRIAGE; the first time an attorney opens the Cockpit, the
 * client-side router processes it exactly like a form ticket and
 * attaches a recommendation. This is the honest P4a boundary — the
 * ticket is real and routed the moment the email arrives; the AI draft
 * is produced on first view, not at ingest.
 *
 * Server-only — imports @aegis/db.
 */
import {
  prisma,
  logAudit,
  getCurrentOrganization,
  IntakeSource,
  IntakeStatus,
} from "@aegis/db";
import { classifyIntakeRegex } from "@aegis/ai";
import { evaluateRoutingRules } from "../routing/rules";
import { loadEnabledRoutingRules, recordRuleFirings } from "../routing/server";

/** Inbound email payload — the shape the webhook accepts and the shape
 * the future Graph poller will map each message into. */
export interface InboundEmail {
  /** Sender display name (e.g. "Dana Lee"). Optional; derived from the
   * address local-part when absent. */
  from?: string;
  /** Sender email address. Used as the stable requester key. */
  fromEmail?: string;
  subject: string;
  body: string;
  /** Mail thread id — recorded on the audit row so a reply can later be
   * threaded (P4b /sendMail In-Reply-To). */
  threadId?: string;
  /** Department hint, if the integration can infer one (distribution
   * list, mailbox tag). Feeds the classifier + routing. */
  department?: string;
  /** Attachment descriptors. P4a records names only (no storage); the
   * intake stays text-based. Surfaced in the description so the
   * attorney sees what was attached. */
  attachments?: Array<{ filename: string; mimeType?: string; sizeBytes?: number }>;
}

export interface IngestEmailResult {
  ticketId: string;
  requesterId: string;
  /** True when the regex classifier matched a known category. */
  classified: boolean;
  type: string;
  priority: string;
  slaHours: number;
  /** Free-text assignee after routing (team or person), if any. */
  assignedTo: string | null;
  /** Routing-rule ids that fired on creation. */
  firedRuleIds: string[];
}

export class EmailIngestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailIngestValidationError";
  }
}

/** Test seam: deterministic clock + id generation. */
export interface IngestOptions {
  /** Override the resolved org (tests). Defaults to the demo org. */
  organizationId?: string;
  now?: number;
  /** Generate the ticket id. Defaults to a time + random suffix. */
  makeTicketId?: () => string;
}

function defaultTicketId(now: number): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `tkt-email-${now.toString(36)}-${rand}`;
}

/** Derive a human name from an email address local-part when no display
 * name was supplied ("dana.lee@x.com" → "Dana Lee"). */
function nameFromEmail(email: string): string {
  const local = email.split("@")[0] || email;
  const words = local
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.join(" ") || email;
}

/**
 * Resolve a requester Person by email (preferred — stable across
 * display-name changes), then by name, then auto-create. The
 * auto-create path mirrors saveTicketsV8's `p-auto-…` fallback; it is a
 * dev-mode convenience for a brand-new external sender, attributed to
 * the email channel so audit surfaces show how the row appeared.
 */
async function resolveRequester(
  organizationId: string,
  name: string,
  email: string | null,
  department: string,
): Promise<string> {
  if (email) {
    const byEmail = await prisma.person.findFirst({
      where: { organizationId, email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    if (byEmail) return byEmail.id;
  }
  const byName = await prisma.person.findFirst({
    where: { organizationId, name },
    select: { id: true },
  });
  if (byName) return byName.id;

  const slugSource = (email || name).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const autoId = "p-auto-" + slugSource;
  const created = await prisma.person.upsert({
    where: { id: autoId },
    update: { name },
    create: {
      id: autoId,
      organizationId,
      type: "EMPLOYEE",
      externalRef: "employee:" + autoId,
      name,
      email: email || autoId + "@aegis-demo.example",
      metadata: { department, autoCreatedByEmailChannel: true },
    },
  });
  return created.id;
}

/**
 * Ingest one inbound email as an IntakeTicket. Idempotent only at the
 * id level — each call creates a new ticket (the caller dedupes by
 * message id if the transport can repeat).
 */
export async function ingestInboundEmail(
  email: InboundEmail,
  opts: IngestOptions = {},
): Promise<IngestEmailResult> {
  const subject = (email.subject ?? "").trim();
  const body = (email.body ?? "").trim();
  if (!subject && !body) {
    throw new EmailIngestValidationError(
      "Email must have a subject or a body to create a ticket.",
    );
  }

  const now = opts.now ?? Date.now();
  const orgId =
    opts.organizationId ?? (await getCurrentOrganization()).id;

  const fromEmail = (email.fromEmail ?? "").trim() || null;
  const fromName =
    (email.from ?? "").trim() ||
    (fromEmail ? nameFromEmail(fromEmail) : "Email Sender");
  const department = (email.department ?? "").trim();

  // Build the description the classifier + the attorney both read:
  // subject as a header line, then the body, then an attachment note.
  const attachmentNote =
    email.attachments && email.attachments.length
      ? `\n\n[Attachments: ${email.attachments
          .map((a) => a.filename)
          .filter(Boolean)
          .join(", ")}]`
      : "";
  const description = `${subject ? subject + "\n\n" : ""}${body}${attachmentNote}`.trim();

  // 1. Classify (deterministic). Falls back to sensible defaults when no
  // category matches — an unclassified email still becomes a real,
  // triageable ticket rather than being dropped.
  const cls = classifyIntakeRegex(`${subject} ${body}`, department);
  const type = cls?.cat ?? "General Inquiry";
  let priority = cls?.priority ?? "Medium";
  let slaHours = cls?.slaHours ?? 24;
  let assignedTo: string | null = cls?.team ?? null;

  // 2. Requester.
  const requesterId = await resolveRequester(
    orgId,
    fromName,
    fromEmail,
    department,
  );

  // 3. Routing rules — same engine as saveTicketsV8. Applied at creation
  // so an email ticket arrives already routed.
  const rules = await loadEnabledRoutingRules(orgId);
  let assignedToUserId: string | null = null;
  let firedRuleIds: string[] = [];
  let firedSummaries: Array<{ id: string; name: string; actions: string[] }> = [];
  if (rules.length > 0) {
    const { patch, fired } = evaluateRoutingRules(rules, {
      type,
      priority,
      department,
      description,
      slaHours,
      assignedToUserId: null,
    });
    if (fired.length > 0) {
      if (patch.priority !== undefined) priority = patch.priority;
      if (patch.slaHours !== undefined) slaHours = patch.slaHours;
      if (patch.assignedToUserId !== undefined)
        assignedToUserId = patch.assignedToUserId;
      if (patch.assignedTo !== undefined) assignedTo = patch.assignedTo;
      firedRuleIds = fired.map((f) => f.id);
      firedSummaries = fired;
    }
  }

  const ticketId = (opts.makeTicketId ?? (() => defaultTicketId(now)))();

  // 4. Persist.
  await prisma.intakeTicket.create({
    data: {
      id: ticketId,
      organizationId: orgId,
      requesterId,
      source: IntakeSource.EMAIL,
      type,
      priority,
      status: IntakeStatus.AWAITING_TRIAGE,
      stage: "new",
      description,
      department: department || null,
      assignedTo,
      assignedToUserId,
      slaHours,
      slaStatus: "On Track",
      submittedAt: new Date(now),
      aiTriageJson: cls
        ? ({
            cat: cls.cat,
            risk: cls.risk,
            note: cls.note,
            confidence: cls.conf,
            source: "regex",
          } as never)
        : (null as never),
      workflowJson: [] as never,
      firedRulesJson:
        firedSummaries.length > 0
          ? ({
              ruleIds: firedRuleIds,
              firedAt: new Date(now).toISOString(),
              summaries: firedSummaries,
            } as never)
          : (null as never),
    },
  });

  // 5. Audit — chain-sealed. SYSTEM actor: the email channel, not a
  // logged-in user, created this ticket.
  await logAudit({
    organizationId: orgId,
    actorId: null,
    actorType: "SYSTEM",
    action: "intake.ticket.created",
    resourceType: "IntakeTicket",
    resourceId: ticketId,
    afterJson: {
      status: IntakeStatus.AWAITING_TRIAGE,
      source: "email",
      type,
      priority,
      classified: !!cls,
    },
    metadata: {
      source: "email-channel",
      fromEmail: fromEmail ?? undefined,
      threadId: email.threadId ?? undefined,
      attachmentCount: email.attachments?.length ?? 0,
    },
  });

  // One row per fired routing rule (same shape as saveTicketsV8).
  for (const f of firedSummaries) {
    await logAudit({
      organizationId: orgId,
      actorId: null,
      actorType: "SYSTEM",
      action: "intake.routing_rule.fired",
      resourceType: "IntakeTicket",
      resourceId: ticketId,
      afterJson: { ruleId: f.id, ruleName: f.name, actions: f.actions },
    });
  }
  await recordRuleFirings(firedRuleIds);

  return {
    ticketId,
    requesterId,
    classified: !!cls,
    type,
    priority,
    slaHours,
    assignedTo,
    firedRuleIds,
  };
}
