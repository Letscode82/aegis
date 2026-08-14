/**
 * @aegis/email — shared transactional email delivery.
 *
 * Provider-abstracted (Resend / SendGrid over plain fetch — zero dependency,
 * proxy-friendly), env-driven, and degrade-to-logged when no key is set so the
 * demo runs with zero mail credentials. Callers build the message (render.ts
 * gives a themed layout) and record the returned `EmailResult` on the audit
 * ledger. No module depends on a mailer directly — this is the one seam, so a
 * later swap to SES / Outlook / per-tenant creds moves no caller.
 */
export {
  sendEmail,
  type EmailResult,
  type SendOptions,
} from "./send";

export {
  resolveEmailConfig,
  buildResendPayload,
  buildSendgridPayload,
  parseAddress,
  toList,
  DEFAULT_FROM,
  type EmailMessage,
  type EmailConfig,
  type EmailProviderName,
  type ResendPayload,
  type SendgridPayload,
} from "./providers";

export {
  renderBasicEmail,
  escapeHtml,
  type BasicEmailInput,
  type RenderedEmail,
} from "./render";
