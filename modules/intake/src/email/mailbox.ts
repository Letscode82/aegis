/**
 * Intake email mailbox — config + polling (P4b).
 *
 * `pollMailboxForIntake` reads new messages from a configured M365
 * mailbox via the matter module's delegated Graph mail service and runs
 * each through the SAME ingest path as the P4a webhook
 * (`ingestInboundEmail`) — so a polled email and a curl'd email become
 * identical IntakeTickets. `lastReceivedAt` is the delta watermark, so
 * re-polling never double-creates.
 *
 * Graph access stays in the matter module (module-isolation): we import
 * `pollDelegatedMailbox` from `@aegis/matter`, never a Graph client here.
 *
 * Server-only — imports @aegis/db.
 */
import { prisma, logAudit, getCurrentUser } from "@aegis/db";
import {
  pollDelegatedMailbox,
  sendDelegatedMail,
  type InboundGraphMessage,
  type PollMailboxOptions,
  type SendMailInput,
} from "@aegis/matter";
import { ingestInboundEmail } from "./server";
import { serverTriageRunner } from "../agents/run-server";

export interface MailboxDTO {
  id: string;
  address: string;
  displayName: string | null;
  enabled: boolean;
  autoAckEnabled: boolean;
  lastReceivedAt: string | null;
  lastPolledAt: string | null;
  lastError: string | null;
}

type Ctx = {
  req?: { headers: Record<string, string | string[] | undefined> };
  res?: unknown;
};

type MailboxRow = {
  id: string;
  address: string;
  displayName: string | null;
  enabled: boolean;
  autoAckEnabled: boolean;
  lastReceivedAt: Date | null;
  lastPolledAt: Date | null;
  lastError: string | null;
};

function toDTO(r: MailboxRow): MailboxDTO {
  return {
    id: r.id,
    address: r.address,
    displayName: r.displayName,
    enabled: r.enabled,
    autoAckEnabled: r.autoAckEnabled,
    lastReceivedAt: r.lastReceivedAt?.toISOString() ?? null,
    lastPolledAt: r.lastPolledAt?.toISOString() ?? null,
    lastError: r.lastError,
  };
}

const SELECT = {
  id: true,
  address: true,
  displayName: true,
  enabled: true,
  autoAckEnabled: true,
  lastReceivedAt: true,
  lastPolledAt: true,
  lastError: true,
} as const;

export class MailboxNotFoundError extends Error {
  constructor(id: string) {
    super(`Intake mailbox ${id} not found`);
    this.name = "MailboxNotFoundError";
  }
}
export class MailboxValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailboxValidationError";
  }
}

export async function listMailboxes(organizationId: string): Promise<MailboxDTO[]> {
  const rows = await prisma.intakeEmailMailbox.findMany({
    where: { organizationId },
    select: SELECT,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toDTO);
}

export async function createMailbox(
  organizationId: string,
  input: { address: string; displayName?: string | null; autoAckEnabled?: boolean },
  ctx: Ctx = {},
): Promise<MailboxDTO> {
  const address = (input.address ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    throw new MailboxValidationError("A valid mailbox address is required.");
  }
  const actor = await getCurrentUser(ctx.req, ctx.res);
  const created = await prisma.intakeEmailMailbox.create({
    data: {
      organizationId,
      address,
      displayName: input.displayName?.trim() || null,
      autoAckEnabled: input.autoAckEnabled ?? false,
      createdBy: actor.id,
    },
    select: SELECT,
  });
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.mailbox.created",
    resourceType: "IntakeEmailMailbox",
    resourceId: created.id,
    afterJson: { address, displayName: created.displayName, autoAckEnabled: created.autoAckEnabled },
  });
  return toDTO(created);
}

/** Patch a mailbox's toggles. Undefined fields are left unchanged. Writes
 * an audit row with the before/after of whatever actually changed. */
export async function updateMailbox(
  organizationId: string,
  id: string,
  patch: { enabled?: boolean; autoAckEnabled?: boolean },
  ctx: Ctx = {},
): Promise<MailboxDTO> {
  const before = await prisma.intakeEmailMailbox.findFirst({
    where: { id, organizationId },
    select: { enabled: true, autoAckEnabled: true },
  });
  if (!before) throw new MailboxNotFoundError(id);

  const data: { enabled?: boolean; autoAckEnabled?: boolean } = {};
  if (patch.enabled !== undefined && patch.enabled !== before.enabled) data.enabled = patch.enabled;
  if (patch.autoAckEnabled !== undefined && patch.autoAckEnabled !== before.autoAckEnabled)
    data.autoAckEnabled = patch.autoAckEnabled;

  const updated = await prisma.intakeEmailMailbox.update({
    where: { id },
    data,
    select: SELECT,
  });
  if (Object.keys(data).length > 0) {
    const actor = await getCurrentUser(ctx.req, ctx.res);
    await logAudit({
      organizationId,
      actorId: actor.id,
      actorType: "USER",
      action: "intake.mailbox.updated",
      resourceType: "IntakeEmailMailbox",
      resourceId: id,
      beforeJson: { enabled: before.enabled, autoAckEnabled: before.autoAckEnabled },
      afterJson: { enabled: updated.enabled, autoAckEnabled: updated.autoAckEnabled },
    });
  }
  return toDTO(updated);
}

/** Back-compat thin wrapper. */
export function setMailboxEnabled(
  organizationId: string,
  id: string,
  enabled: boolean,
  ctx: Ctx = {},
): Promise<MailboxDTO> {
  return updateMailbox(organizationId, id, { enabled }, ctx);
}

export async function deleteMailbox(
  organizationId: string,
  id: string,
  ctx: Ctx = {},
): Promise<void> {
  const before = await prisma.intakeEmailMailbox.findFirst({
    where: { id, organizationId },
    select: { address: true },
  });
  if (!before) throw new MailboxNotFoundError(id);
  await prisma.intakeEmailMailbox.delete({ where: { id } });
  const actor = await getCurrentUser(ctx.req, ctx.res);
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.mailbox.deleted",
    resourceType: "IntakeEmailMailbox",
    resourceId: id,
    beforeJson: { address: before.address },
  });
}

export interface PollResult {
  mailboxId: string;
  address: string;
  /** Messages returned by Graph this pass. */
  polled: number;
  /** Tickets created (excludes idempotent-dedupe hits). */
  created: number;
  /** Auto-acknowledgement replies sent this pass. */
  acknowledged: number;
  /** New watermark (ISO) after this pass, if it advanced. */
  watermark: string | null;
  skipped?: "disabled";
  error?: string;
}

/** Test seam: the Graph poller (defaults to the matter delegated client). */
export type MailPoller = (
  organizationId: string,
  mailbox: string,
  opts?: PollMailboxOptions,
) => Promise<InboundGraphMessage[]>;

/** Test seam: the outbound mail sender (defaults to the matter client). */
export type MailSender = (
  organizationId: string,
  input: SendMailInput,
) => Promise<void>;

/**
 * Poll one mailbox and ingest every new message as an IntakeTicket.
 * Idempotent across calls via the receivedDateTime watermark. On a Graph
 * failure the error is recorded on the row (lastError) and surfaced in
 * the result; partial progress (messages already ingested) is kept.
 */
export async function pollMailboxForIntake(
  organizationId: string,
  mailboxId: string,
  opts: { poller?: MailPoller; sendMail?: MailSender } = {},
): Promise<PollResult> {
  const poller = opts.poller ?? pollDelegatedMailbox;
  const sendMail = opts.sendMail ?? sendDelegatedMail;
  const mb = await prisma.intakeEmailMailbox.findFirst({
    where: { id: mailboxId, organizationId },
    select: { id: true, address: true, enabled: true, autoAckEnabled: true, lastReceivedAt: true },
  });
  if (!mb) throw new MailboxNotFoundError(mailboxId);

  const base: PollResult = {
    mailboxId: mb.id,
    address: mb.address,
    polled: 0,
    created: 0,
    acknowledged: 0,
    watermark: mb.lastReceivedAt?.toISOString() ?? null,
  };
  if (!mb.enabled) return { ...base, skipped: "disabled" };

  let messages: InboundGraphMessage[];
  try {
    messages = await poller(organizationId, mb.address, {
      sinceIso: mb.lastReceivedAt?.toISOString() ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.intakeEmailMailbox.update({
      where: { id: mb.id },
      data: { lastPolledAt: new Date(), lastError: message },
    });
    return { ...base, error: message };
  }

  // Oldest-first so the watermark advances monotonically even on partial
  // failure mid-loop.
  messages.sort((a, b) => a.receivedDateTime.localeCompare(b.receivedDateTime));

  let created = 0;
  let acknowledged = 0;
  let watermarkMs = mb.lastReceivedAt?.getTime() ?? 0;
  for (const m of messages) {
    const receivedMs = Date.parse(m.receivedDateTime);
    // internetMessageId is the stable dedupe key (and reply anchor).
    const result = await ingestInboundEmail(
      {
        from: m.fromName ?? undefined,
        fromEmail: m.fromEmail ?? undefined,
        subject: m.subject,
        body: m.bodyText,
        threadId: m.conversationId ?? undefined,
        messageId: m.internetMessageId ?? undefined,
        attachments: m.hasAttachments
          ? [{ filename: "(email attachment)" }]
          : undefined,
      },
      {
        organizationId,
        now: Number.isFinite(receivedMs) ? receivedMs : undefined,
        triage: serverTriageRunner,
      },
    );
    if (Number.isFinite(receivedMs) && receivedMs > watermarkMs) watermarkMs = receivedMs;
    if (result.deduped) continue; // already ingested — don't re-ack
    created += 1;

    // Outbound auto-acknowledgement (opt-in per mailbox). Best-effort —
    // a send failure never fails the poll or the ticket.
    if (mb.autoAckEnabled && m.fromEmail) {
      try {
        await sendMail(organizationId, {
          mailbox: mb.address,
          to: m.fromEmail,
          subject: `Re: ${m.subject || "Your legal request"}`,
          body:
            `Hi ${m.fromName || "there"},\n\n` +
            `Thanks — we've received your request and AEGIS Legal has logged it as ${result.ticketId}. ` +
            `An attorney will review it shortly; no action is needed from you right now.\n\n` +
            `— AEGIS Legal Intake`,
          inReplyToInternetMessageId: m.internetMessageId,
        });
        acknowledged += 1;
      } catch (err) {
        console.error("[mailbox/poll] auto-ack send failed (non-fatal):", err);
      }
    }
  }

  const newWatermark = watermarkMs > 0 ? new Date(watermarkMs) : null;
  await prisma.intakeEmailMailbox.update({
    where: { id: mb.id },
    data: {
      lastPolledAt: new Date(),
      lastError: null,
      ...(newWatermark ? { lastReceivedAt: newWatermark } : {}),
    },
  });

  return {
    ...base,
    polled: messages.length,
    created,
    acknowledged,
    watermark: newWatermark?.toISOString() ?? base.watermark,
  };
}

/** Poll every enabled mailbox for an org (admin trigger / scheduler). */
export async function pollAllEnabledMailboxes(
  organizationId: string,
  opts: { poller?: MailPoller; sendMail?: MailSender } = {},
): Promise<PollResult[]> {
  const rows = await prisma.intakeEmailMailbox.findMany({
    where: { organizationId, enabled: true },
    select: { id: true },
  });
  const out: PollResult[] = [];
  for (const r of rows) {
    out.push(await pollMailboxForIntake(organizationId, r.id, opts));
  }
  return out;
}
