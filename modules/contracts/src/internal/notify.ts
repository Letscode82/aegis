/**
 * Contract email delivery (CTR-19) — the real "send" for the three
 * tokenised / notice surfaces that previously only minted a link the
 * attorney copy-pasted:
 *
 *   - review invite     (mintContractReviewToken → counterparty reviewer)
 *   - signature invite   (requestSignature → the signer)
 *   - renewal notice     (markRenewalNoticeSent → counterparty contacts)
 *
 * Delivery goes through the shared `@aegis/email` mailer — provider-abstracted
 * and degrade-to-logged, so this stays a no-op (not an error) when no mail
 * provider is configured. Every attempt is chain-sealed: `contract.email.sent`
 * on delivery, `contract.email.not_delivered` with the structured reason
 * otherwise (including the zero-config "not-configured" case). The mutation
 * that triggered the send never rolls back on a mail failure — the audit row
 * is the record of intent, exactly like notice issuance elsewhere.
 */
import { logAudit } from "@aegis/db";
import { sendEmail, renderBasicEmail, type EmailResult } from "@aegis/email";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

export type ContractEmailKind = "review_invite" | "signature_invite" | "renewal_notice";

interface DeliverInput {
  organizationId: string;
  contractId: string;
  kind: ContractEmailKind;
  to: string[];
  subject: string;
  heading: string;
  paragraphs: string[];
  button?: { label: string; url: string } | null;
  footnote?: string | null;
  actor: Actor;
}

/** Compose → send → chain-seal the outcome. Best-effort; never throws. */
async function deliver(input: DeliverInput): Promise<EmailResult> {
  const recipients = input.to.map((s) => (s || "").trim()).filter(Boolean);
  const { html, text } = renderBasicEmail({
    heading: input.heading,
    paragraphs: input.paragraphs,
    button: input.button ?? null,
    footnote: input.footnote ?? null,
  });

  let result: EmailResult;
  try {
    result = await sendEmail({ to: recipients, subject: input.subject, html, text });
  } catch (err) {
    // sendEmail is designed not to throw, but never let mail sink a mutation.
    result = { delivered: false, provider: "none", reason: String((err as Error)?.message || err) };
  }

  await logAudit({
    organizationId: input.organizationId,
    actorId: input.actor.id,
    actorType: input.actor.type ?? (input.actor.id ? "USER" : "SYSTEM"),
    action: result.delivered ? "contract.email.sent" : "contract.email.not_delivered",
    resourceType: "Contract",
    resourceId: input.contractId,
    afterJson: {
      kind: input.kind,
      to: recipients,
      subject: input.subject,
      provider: result.provider,
      delivered: result.delivered,
      providerMessageId: result.id ?? null,
      reason: result.reason ?? null,
    } as never,
    metadata: { source: "contracts", channel: "email", kind: input.kind } as never,
  }).catch(() => {});

  return result;
}

export function sendContractReviewInvite(args: {
  organizationId: string;
  contractId: string;
  to: string | null | undefined;
  contractTitle: string;
  counterpartyName?: string | null;
  reviewerName?: string | null;
  url: string;
  expiresAt: string;
  actor: Actor;
}): Promise<EmailResult> {
  const expires = new Date(args.expiresAt);
  const expiresLabel = Number.isNaN(expires.getTime()) ? null : expires.toISOString().slice(0, 10);
  return deliver({
    organizationId: args.organizationId,
    contractId: args.contractId,
    kind: "review_invite",
    to: args.to ? [args.to] : [],
    subject: `Please review: ${args.contractTitle}`,
    heading: `You've been invited to review "${args.contractTitle}"`,
    paragraphs: [
      `${args.reviewerName ? args.reviewerName + ", you" : "You"} have been invited to review this contract${
        args.counterpartyName ? ` on behalf of ${args.counterpartyName}` : ""
      }.`,
      "Open the secure link below to read the current draft, add comments, and record your response. No account or sign-in is required.",
    ],
    button: { label: "Open the review", url: args.url },
    footnote: expiresLabel ? `This link expires on ${expiresLabel}. Do not forward it — it grants access to this document.` : "Do not forward this link — it grants access to this document.",
    actor: args.actor,
  });
}

export function sendContractSignatureInvite(args: {
  organizationId: string;
  contractId: string;
  to: string | null | undefined;
  contractTitle: string;
  signerName: string;
  url: string;
  expiresAt: string;
  actor: Actor;
}): Promise<EmailResult> {
  const expires = new Date(args.expiresAt);
  const expiresLabel = Number.isNaN(expires.getTime()) ? null : expires.toISOString().slice(0, 10);
  return deliver({
    organizationId: args.organizationId,
    contractId: args.contractId,
    kind: "signature_invite",
    to: args.to ? [args.to] : [],
    subject: `Signature requested: ${args.contractTitle}`,
    heading: `Your signature is requested on "${args.contractTitle}"`,
    paragraphs: [
      `${args.signerName}, please review and sign this contract.`,
      "Open the secure signing link below to read the final terms, confirm your identity, and apply your electronic signature.",
    ],
    button: { label: "Review and sign", url: args.url },
    footnote: expiresLabel ? `This signing link expires on ${expiresLabel}.` : null,
    actor: args.actor,
  });
}

export function sendContractRenewalNotice(args: {
  organizationId: string;
  contractId: string;
  to: string[];
  contractTitle: string;
  counterpartyName?: string | null;
  expiryDate?: string | null;
  url?: string | null;
  actor: Actor;
}): Promise<EmailResult> {
  const expiry = args.expiryDate ? new Date(args.expiryDate) : null;
  const expiryLabel = expiry && !Number.isNaN(expiry.getTime()) ? expiry.toISOString().slice(0, 10) : null;
  return deliver({
    organizationId: args.organizationId,
    contractId: args.contractId,
    kind: "renewal_notice",
    to: args.to,
    subject: `Renewal notice: ${args.contractTitle}`,
    heading: `Renewal notice for "${args.contractTitle}"`,
    paragraphs: [
      `${args.counterpartyName ? args.counterpartyName + "," : "Hello,"}`,
      `This is formal notice regarding the upcoming renewal of "${args.contractTitle}"${
        expiryLabel ? `, which is scheduled to end on ${expiryLabel}` : ""
      }. Please contact your account representative to discuss renewal terms.`,
    ],
    button: args.url ? { label: "View the contract", url: args.url } : null,
    footnote: "This message is a record of notice given under the terms of the agreement.",
    actor: args.actor,
  });
}
