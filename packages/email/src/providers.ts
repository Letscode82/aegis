/**
 * Provider selection + payload shaping (pure; unit-tested, no network).
 *
 * Two zero-dependency HTTP transports so the mailer works through the
 * outbound proxy with nothing to install: Resend and SendGrid. Selection is
 * env-driven and pure — `resolveEmailConfig(env)` decides which provider (if
 * any) is live, and the `build*Payload` helpers shape the request body each
 * API expects. When neither key is set the provider is "none" and delivery
 * degrades to a logged no-op (see send.ts) — the same zero-config posture as
 * the AI client degrading to the deterministic path.
 */

export type EmailProviderName = "resend" | "sendgrid" | "none";

export interface EmailMessage {
  /** One or more recipients. "a@b.com" or "Name <a@b.com>". */
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string | null;
  cc?: string[];
  bcc?: string[];
}

export interface EmailConfig {
  provider: EmailProviderName;
  /** The active provider's API key (undefined when provider is "none"). */
  apiKey?: string;
  /** RFC-5322 From, e.g. "AEGIS <no-reply@aegis.example>". */
  from: string;
}

export const DEFAULT_FROM = "AEGIS <no-reply@aegis.local>";

/** Normalise `to` (string | string[]) to a non-empty string[] (may be empty). */
export function toList(to: string | string[] | undefined): string[] {
  if (!to) return [];
  const arr = Array.isArray(to) ? to : [to];
  return arr.map((s) => (s || "").trim()).filter(Boolean);
}

/**
 * Decide the live provider from the environment. Resend wins over SendGrid
 * when both are set (arbitrary but deterministic). Pure — takes the env map.
 */
export function resolveEmailConfig(env: Record<string, string | undefined> = process.env): EmailConfig {
  const from = (env.MAIL_FROM || "").trim() || DEFAULT_FROM;
  const resend = (env.RESEND_API_KEY || "").trim();
  if (resend) return { provider: "resend", apiKey: resend, from };
  const sendgrid = (env.SENDGRID_API_KEY || "").trim();
  if (sendgrid) return { provider: "sendgrid", apiKey: sendgrid, from };
  return { provider: "none", from };
}

// ── Resend (https://resend.com/docs/api-reference/emails/send-email) ──

export interface ResendPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  cc?: string[];
  bcc?: string[];
  reply_to?: string;
}

export function buildResendPayload(msg: EmailMessage, from: string): ResendPayload {
  const p: ResendPayload = { from, to: toList(msg.to), subject: msg.subject, html: msg.html };
  if (msg.text) p.text = msg.text;
  if (msg.cc?.length) p.cc = msg.cc;
  if (msg.bcc?.length) p.bcc = msg.bcc;
  if (msg.replyTo) p.reply_to = msg.replyTo;
  return p;
}

// ── SendGrid v3 (https://docs.sendgrid.com/api-reference/mail-send) ───

export interface SendgridPayload {
  personalizations: Array<{ to: Array<{ email: string }>; cc?: Array<{ email: string }>; bcc?: Array<{ email: string }> }>;
  from: { email: string; name?: string };
  subject: string;
  content: Array<{ type: string; value: string }>;
  reply_to?: { email: string };
}

/** Parse "Name <email>" or "email" into { name?, email }. */
export function parseAddress(addr: string): { name?: string; email: string } {
  const m = /^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/.exec(addr);
  if (m && m[2]) return { name: m[1] || undefined, email: m[2].trim() };
  return { email: addr.trim() };
}

export function buildSendgridPayload(msg: EmailMessage, from: string): SendgridPayload {
  const fromAddr = parseAddress(from);
  const content: Array<{ type: string; value: string }> = [];
  // SendGrid requires text/plain before text/html when both are present.
  if (msg.text) content.push({ type: "text/plain", value: msg.text });
  content.push({ type: "text/html", value: msg.html });
  const personalization: SendgridPayload["personalizations"][number] = {
    to: toList(msg.to).map((email) => ({ email })),
  };
  if (msg.cc?.length) personalization.cc = msg.cc.map((email) => ({ email }));
  if (msg.bcc?.length) personalization.bcc = msg.bcc.map((email) => ({ email }));
  const payload: SendgridPayload = {
    personalizations: [personalization],
    from: fromAddr.name ? { email: fromAddr.email, name: fromAddr.name } : { email: fromAddr.email },
    subject: msg.subject,
    content,
  };
  if (msg.replyTo) payload.reply_to = { email: parseAddress(msg.replyTo).email };
  return payload;
}
