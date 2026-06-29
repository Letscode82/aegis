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
  type InboundGraphMessage,
  type PollMailboxOptions,
} from "@aegis/matter";
import { ingestInboundEmail } from "./server";

export interface MailboxDTO {
  id: string;
  address: string;
  displayName: string | null;
  enabled: boolean;
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
  input: { address: string; displayName?: string | null },
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
    afterJson: { address, displayName: created.displayName },
  });
  return toDTO(created);
}

export async function setMailboxEnabled(
  organizationId: string,
  id: string,
  enabled: boolean,
  ctx: Ctx = {},
): Promise<MailboxDTO> {
  const before = await prisma.intakeEmailMailbox.findFirst({
    where: { id, organizationId },
    select: { enabled: true },
  });
  if (!before) throw new MailboxNotFoundError(id);
  const updated = await prisma.intakeEmailMailbox.update({
    where: { id },
    data: { enabled },
    select: SELECT,
  });
  if (before.enabled !== enabled) {
    const actor = await getCurrentUser(ctx.req, ctx.res);
    await logAudit({
      organizationId,
      actorId: actor.id,
      actorType: "USER",
      action: "intake.mailbox.updated",
      resourceType: "IntakeEmailMailbox",
      resourceId: id,
      beforeJson: { enabled: before.enabled },
      afterJson: { enabled },
    });
  }
  return toDTO(updated);
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
  /** Tickets created (one per message). */
  created: number;
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

/**
 * Poll one mailbox and ingest every new message as an IntakeTicket.
 * Idempotent across calls via the receivedDateTime watermark. On a Graph
 * failure the error is recorded on the row (lastError) and surfaced in
 * the result; partial progress (messages already ingested) is kept.
 */
export async function pollMailboxForIntake(
  organizationId: string,
  mailboxId: string,
  opts: { poller?: MailPoller } = {},
): Promise<PollResult> {
  const poller = opts.poller ?? pollDelegatedMailbox;
  const mb = await prisma.intakeEmailMailbox.findFirst({
    where: { id: mailboxId, organizationId },
    select: { id: true, address: true, enabled: true, lastReceivedAt: true },
  });
  if (!mb) throw new MailboxNotFoundError(mailboxId);

  const base: PollResult = {
    mailboxId: mb.id,
    address: mb.address,
    polled: 0,
    created: 0,
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
  let watermarkMs = mb.lastReceivedAt?.getTime() ?? 0;
  for (const m of messages) {
    const receivedMs = Date.parse(m.receivedDateTime);
    await ingestInboundEmail(
      {
        from: m.fromName ?? undefined,
        fromEmail: m.fromEmail ?? undefined,
        subject: m.subject,
        body: m.bodyText,
        threadId: m.conversationId ?? undefined,
        attachments: m.hasAttachments
          ? [{ filename: "(email attachment)" }]
          : undefined,
      },
      { organizationId, now: Number.isFinite(receivedMs) ? receivedMs : undefined },
    );
    created += 1;
    if (Number.isFinite(receivedMs) && receivedMs > watermarkMs) watermarkMs = receivedMs;
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
    watermark: newWatermark?.toISOString() ?? base.watermark,
  };
}

/** Poll every enabled mailbox for an org (admin trigger / scheduler). */
export async function pollAllEnabledMailboxes(
  organizationId: string,
  opts: { poller?: MailPoller } = {},
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
