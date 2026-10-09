/**
 * User invite email (professional onboarding).
 *
 * Inviting a user writes the OneLegal `User` authorization row, but the person
 * still needs an Auth0 credential to sign in. This service closes the loop:
 * it mints a one-time "set your password" link via the Auth0 Management API
 * (`@aegis/auth/management`) and emails a branded invitation through the shared
 * `@aegis/email` mailer.
 *
 * Both seams degrade safely:
 *   - No Auth0 Management creds → no set-password link. The email falls back to
 *     "an account was created, sign in at <app>" so the invite still reaches the
 *     person; the reason is recorded.
 *   - No mail provider → `sendEmail` logs and reports not-delivered (not an
 *     error). The invite (and its User row) is never rolled back by a mail or
 *     provisioning failure — exactly like contract notices elsewhere.
 *
 * Every attempt is chain-sealed: `user.invite_email.sent` on delivery,
 * `user.invite_email.not_delivered` with the structured reason otherwise.
 */
import { logAudit } from "@aegis/db";
import { sendEmail, renderBasicEmail } from "@aegis/email";
import { createInviteSetPasswordLink } from "@aegis/auth/management";

export interface InviteEmailOutcome {
  /** True when a mail provider accepted the message. */
  delivered: boolean;
  /** Why it wasn't delivered, or why no set-password link was minted. */
  reason?: string;
  /** True when an Auth0 set-password link was created for this invite. */
  linkCreated: boolean;
}

export interface InviteEmailContent {
  subject: string;
  heading: string;
  paragraphs: string[];
  button: { label: string; url: string } | null;
  footnote: string | null;
}

/**
 * Pure: build the invite email copy. Two shapes depending on whether a
 * set-password link was minted. Exported for testing.
 */
export function buildInviteEmailContent(args: {
  recipientName: string;
  orgName?: string | null;
  inviterName?: string | null;
  roleName?: string | null;
  setPasswordUrl?: string | null;
  appUrl?: string | null;
}): InviteEmailContent {
  const org = (args.orgName || "").trim() || "OneLegal";
  const inviter = (args.inviterName || "").trim();
  const role = (args.roleName || "").trim();
  const greetingName = (args.recipientName || "").trim();

  const opening =
    `Hello${greetingName ? ` ${greetingName}` : ""}, you've been invited` +
    `${inviter ? ` by ${inviter}` : ""} to join ${org} on OneLegal, the legal operations platform.`;
  const roleLine = role ? `Your access level is ${role}.` : null;

  if (args.setPasswordUrl) {
    return {
      subject: `You're invited to ${org} on OneLegal`,
      heading: "Set up your OneLegal account",
      paragraphs: [
        opening,
        ...(roleLine ? [roleLine] : []),
        "To get started, set your password using the button below. Once it's set you can sign in any time.",
      ],
      button: { label: "Set your password", url: args.setPasswordUrl },
      footnote: "This link expires in 7 days. If it does, ask your administrator to resend the invitation.",
    };
  }

  // Degraded path — no set-password link available.
  return {
    subject: `You're invited to ${org} on OneLegal`,
    heading: "You've been invited to OneLegal",
    paragraphs: [
      opening,
      ...(roleLine ? [roleLine] : []),
      args.appUrl
        ? "Open OneLegal using the button below and sign in with this email address."
        : "Your administrator will share the sign-in link with you shortly.",
    ],
    button: args.appUrl ? { label: "Open OneLegal", url: args.appUrl } : null,
    footnote: null,
  };
}

export interface SendInviteEmailInput {
  organizationId: string;
  user: { id: string; email: string; name: string; roleName?: string | null };
  orgName?: string | null;
  inviterName?: string | null;
  actor: { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };
  /** The event recorded on the audit ledger. */
  auditAction?: "user.invite_email.sent" | "user.invite_resent";
}

/**
 * Compose → mint link → send → chain-seal. Best-effort; never throws. Returns
 * the outcome so the caller (invite / resend) can surface it in the UI.
 */
export async function sendUserInviteEmail(input: SendInviteEmailInput): Promise<InviteEmailOutcome> {
  const email = (input.user.email || "").trim();
  if (!email) return { delivered: false, reason: "no-recipient", linkCreated: false };

  const appUrl = (process.env.AUTH0_BASE_URL || "").trim() || null;

  // Mint the set-password link (degrades to { ok:false } when unconfigured).
  const link = await createInviteSetPasswordLink({ email, name: input.user.name });
  const setPasswordUrl = link.ok ? link.url : null;
  const linkReason = link.ok ? undefined : link.reason;

  const content = buildInviteEmailContent({
    recipientName: input.user.name,
    orgName: input.orgName,
    inviterName: input.inviterName,
    roleName: input.user.roleName,
    setPasswordUrl,
    appUrl,
  });

  const { html, text } = renderBasicEmail({
    heading: content.heading,
    paragraphs: content.paragraphs,
    button: content.button,
    footnote: content.footnote,
  });

  let delivered = false;
  let provider = "none";
  let providerId: string | null = null;
  let sendReason: string | undefined;
  try {
    const res = await sendEmail({ to: email, subject: content.subject, html, text });
    delivered = res.delivered;
    provider = res.provider;
    providerId = res.id ?? null;
    sendReason = res.reason;
  } catch (err) {
    sendReason = String((err as Error)?.message || err);
  }

  // A delivered email with no set-password link is a partial success — the
  // person got mail but can't set a password yet. Surface the link reason.
  const reason = !delivered ? sendReason : linkReason;

  await logAudit({
    organizationId: input.organizationId,
    actorId: input.actor.id,
    actorType: input.actor.type ?? (input.actor.id ? "USER" : "SYSTEM"),
    action: delivered ? input.auditAction ?? "user.invite_email.sent" : "user.invite_email.not_delivered",
    resourceType: "User",
    resourceId: input.user.id,
    afterJson: {
      to: email,
      subject: content.subject,
      provider,
      delivered,
      providerMessageId: providerId,
      setPasswordLink: Boolean(setPasswordUrl),
      reason: reason ?? null,
    },
    metadata: { source: "admin-ui" },
  });

  return { delivered, reason, linkCreated: Boolean(setPasswordUrl) };
}
