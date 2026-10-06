/**
 * W3-2 · Notifications (issue #114) — outbound email on ticket events.
 *
 * One entry point: `notifyTicketEvent({organizationId, ticketId, kind})`.
 * Resolves the right recipient for the event kind (assignment/breach →
 * the assignee; stage/closure → the requester), honors the per-user
 * notification preferences, sends through the org's enabled intake
 * mailbox via the P4b delegated sendMail path when one is configured —
 * and records honestly when it isn't (delivered:false, reason
 * "no-mailbox"), same stub-first posture as the legal-hold notices.
 *
 * BEST-EFFORT BY CONTRACT: this function never throws. A notification
 * failure must never roll back or fail the mutation that triggered it.
 * Every attempt writes a chain-sealed `intake.notification.sent` audit
 * row (SYSTEM actor) with {kind, to, delivered, reason}.
 *
 * Server-only — imports @aegis/db (+ @aegis/matter for Graph send).
 */
import { prisma, logAudit } from "@aegis/db";
import { sendDelegatedMail } from "@aegis/matter";
import {
  buildNotificationEmail,
  normalizePrefs,
  prefAllows,
  toSnippet,
} from "./templates";
import type { NotificationKind, NotificationPrefs } from "./templates";

export {
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_KINDS,
  normalizePrefs,
} from "./templates";
export type { NotificationKind, NotificationPrefs } from "./templates";

/** UserPreference key holding the per-user toggles. */
export const NOTIFY_PREFS_KEY = "aegis:intake:notification-prefs:v1";

export interface NotifyResult {
  attempted: number;
  delivered: number;
  skipped: number;
}

type Sender = (
  organizationId: string,
  input: { mailbox: string; to: string; subject: string; body: string },
) => Promise<void>;

export interface NotifyOptions {
  /** Test seam — replaces the Graph delegated send. */
  send?: Sender;
  /** Base URL for links in the email (e.g. https://aegis.example). */
  appUrl?: string | null;
}

/** Read a user's notification prefs (missing row → all on). */
export async function getNotificationPrefs(
  userId: string,
): Promise<NotificationPrefs> {
  const row = await prisma.userPreference.findUnique({
    where: { userId_key: { userId, key: NOTIFY_PREFS_KEY } },
  });
  return normalizePrefs(row?.value);
}

export async function setNotificationPrefs(
  userId: string,
  value: NotificationPrefs,
): Promise<NotificationPrefs> {
  const prefs = normalizePrefs(value);
  await prisma.userPreference.upsert({
    where: { userId_key: { userId, key: NOTIFY_PREFS_KEY } },
    update: { value: prefs as never },
    create: { userId, key: NOTIFY_PREFS_KEY, value: prefs as never },
  });
  return prefs;
}

interface Recipient {
  userId: string | null;
  name: string | null;
  email: string | null;
}

/**
 * Notify the right people about one ticket event. Never throws.
 */
export async function notifyTicketEvent(
  input: {
    organizationId: string;
    ticketId: string;
    kind: NotificationKind;
  },
  opts: NotifyOptions = {},
): Promise<NotifyResult> {
  const result: NotifyResult = { attempted: 0, delivered: 0, skipped: 0 };
  try {
    const { organizationId, ticketId, kind } = input;

    const ticket = await prisma.intakeTicket.findFirst({
      where: { id: ticketId, organizationId },
      select: {
        id: true,
        type: true,
        priority: true,
        stage: true,
        status: true,
        slaHours: true,
        description: true,
        requester: { select: { userId: true, name: true, email: true } },
        assignedToUser: { select: { id: true, name: true, email: true } },
      },
    });
    if (!ticket) return result;

    // Recipient per kind: operational events go to the assignee,
    // requester-facing events go to the requester.
    const recipients: Recipient[] = [];
    if (kind === "assignment" || kind === "breach") {
      if (ticket.assignedToUser) {
        recipients.push({
          userId: ticket.assignedToUser.id,
          name: ticket.assignedToUser.name,
          email: ticket.assignedToUser.email,
        });
      }
    } else {
      if (ticket.requester) {
        recipients.push({
          userId: ticket.requester.userId ?? null,
          name: ticket.requester.name,
          email: ticket.requester.email,
        });
      }
    }
    if (recipients.length === 0) return result;

    // Sender mailbox — the org's first enabled intake mailbox. When
    // none is configured the notification is recorded, not delivered.
    const mailbox = await prisma.intakeEmailMailbox.findFirst({
      where: { organizationId, enabled: true },
      orderBy: { createdAt: "asc" },
      select: { address: true },
    });

    const email = buildNotificationEmail(kind, {
      ticketId: ticket.id,
      descSnippet: toSnippet(ticket.description),
      type: ticket.type,
      priority: ticket.priority,
      stage: ticket.stage,
      status: ticket.status,
      assigneeName: ticket.assignedToUser?.name ?? null,
      slaHours: ticket.slaHours,
      appUrl: opts.appUrl ?? process.env.AEGIS_APP_URL ?? null,
    });

    const send = opts.send ?? sendDelegatedMail;

    for (const r of recipients) {
      // Per-user toggles apply to platform users; requesters without a
      // linked User row have no settings surface yet → default on.
      if (r.userId) {
        const prefs = await getNotificationPrefs(r.userId);
        if (!prefAllows(prefs, kind)) {
          result.skipped += 1;
          continue;
        }
      }
      if (!r.email) {
        result.skipped += 1;
        continue;
      }

      result.attempted += 1;
      let delivered = false;
      let reason: string | null = null;
      if (!mailbox) {
        reason = "no-mailbox";
      } else {
        try {
          await send(organizationId, {
            mailbox: mailbox.address,
            to: r.email,
            subject: email.subject,
            body: email.body,
          });
          delivered = true;
        } catch (err) {
          reason = err instanceof Error ? err.message : String(err);
        }
      }
      if (delivered) result.delivered += 1;

      await logAudit({
        organizationId,
        actorId: null,
        actorType: "SYSTEM",
        action: "intake.notification.sent",
        resourceType: "IntakeTicket",
        resourceId: ticketId,
        afterJson: {
          kind,
          to: r.email,
          recipientUserId: r.userId,
          subject: email.subject,
          delivered,
          ...(reason ? { reason } : {}),
        },
      });
    }
  } catch {
    // Best-effort by contract — never fail the triggering mutation.
  }
  return result;
}
