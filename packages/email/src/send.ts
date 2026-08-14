/**
 * The one send path. Resolves the provider from the environment (or an
 * injected config), shapes the provider-specific payload, and POSTs it with
 * the global `fetch` (zero dependency; proxy-friendly). Never throws — a send
 * failure returns a structured `{ delivered:false, reason }` so callers can
 * record the outcome on the audit ledger and carry on. When no provider is
 * configured the message is logged and reported as not-delivered, so the demo
 * runs with zero mail credentials.
 */
import {
  resolveEmailConfig,
  buildResendPayload,
  buildSendgridPayload,
  toList,
  type EmailConfig,
  type EmailMessage,
  type EmailProviderName,
} from "./providers";

export interface EmailResult {
  delivered: boolean;
  provider: EmailProviderName;
  /** Provider message id when the API returns one. */
  id?: string | null;
  /** Why it wasn't delivered (only when delivered === false). */
  reason?: string;
}

export interface SendOptions {
  /** Override the env-resolved config (tests / per-tenant creds later). */
  config?: EmailConfig;
  /** Inject a fetch implementation (tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const SENDGRID_ENDPOINT = "https://api.sendgrid.com/v3/mail/send";

export async function sendEmail(msg: EmailMessage, opts: SendOptions = {}): Promise<EmailResult> {
  const config = opts.config ?? resolveEmailConfig();
  const recipients = toList(msg.to);

  if (recipients.length === 0) {
    return { delivered: false, provider: config.provider, reason: "no-recipient" };
  }

  if (config.provider === "none" || !config.apiKey) {
    // Zero-config path: nothing to send through. Make it visible in logs so a
    // dev knows why no mail arrived, then report not-delivered (not an error).
    console.info(`[email] not configured — would send "${msg.subject}" to ${recipients.join(", ")}`);
    return { delivered: false, provider: "none", reason: "not-configured" };
  }

  const doFetch = opts.fetchImpl ?? fetch;

  try {
    if (config.provider === "resend") {
      const res = await doFetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildResendPayload(msg, config.from)),
      });
      if (!res.ok) {
        return { delivered: false, provider: "resend", reason: `http-${res.status}` };
      }
      const body = (await res.json().catch(() => ({}))) as { id?: string };
      return { delivered: true, provider: "resend", id: body?.id ?? null };
    }

    // sendgrid
    const res = await doFetch(SENDGRID_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildSendgridPayload(msg, config.from)),
    });
    if (!res.ok) {
      return { delivered: false, provider: "sendgrid", reason: `http-${res.status}` };
    }
    // SendGrid returns 202 with an empty body; the id is in the header.
    const id = res.headers?.get?.("x-message-id") ?? null;
    return { delivered: true, provider: "sendgrid", id };
  } catch (err) {
    return { delivered: false, provider: config.provider, reason: String((err as Error)?.message || err) };
  }
}
