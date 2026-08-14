/**
 * Response assembly + delivery (the "Deliver" phase). Assembles the package
 * from human-validated review items and confirmed data locations, mints a
 * login-less DELIVERY token, emails the data subject a secure link through the
 * shared @aegis/email mailer, and closes the case to FULFILLED — all
 * chain-sealed. Delivery is gated: every review item must be validated (none
 * PENDING) and, for an ERASURE, the legal-hold conflict must be resolved or
 * explicitly overridden.
 */
import { prisma, logAudit } from "@aegis/db";
import { sendEmail, renderBasicEmail } from "@aegis/email";
import { getDsarDetail, type Actor, type DsarDetailDTO } from "./requests";
import { generateRawToken, hashToken, portalUrl } from "./tokens";

export interface ResponsePackageItem {
  title: string;
  sourceSystem: string;
  disclosure: "INCLUDED" | "REDACTED";
  redactionNote: string | null;
}

export interface ResponsePackage {
  requestId: string;
  includedCount: number;
  redactedCount: number;
  excludedCount: number;
  dataLocationsWithData: number;
  items: ResponsePackageItem[];
  assembledAt: string;
}

interface PackItem { title: string; sourceSystem: string; reviewDecision: string; finalRelevant: boolean | null; redact: boolean; redactionNote: string | null }

/** Pure package assembly: validated+relevant items become disclosures
 *  (redacted where flagged); non-relevant items are excluded. */
export function buildResponsePackage(
  requestId: string,
  items: PackItem[],
  dataLocationsWithData: number,
  now: Date,
): ResponsePackage {
  const included: ResponsePackageItem[] = [];
  let excludedCount = 0;
  let redactedCount = 0;
  for (const it of items) {
    const validated = it.reviewDecision !== "PENDING";
    if (!validated || !it.finalRelevant) { excludedCount += 1; continue; }
    if (it.redact) redactedCount += 1;
    included.push({
      title: it.title,
      sourceSystem: it.sourceSystem,
      disclosure: it.redact ? "REDACTED" : "INCLUDED",
      redactionNote: it.redact ? it.redactionNote : null,
    });
  }
  return {
    requestId,
    includedCount: included.length,
    redactedCount,
    excludedCount,
    dataLocationsWithData,
    items: included,
    assembledAt: now.toISOString(),
  };
}

/** Assemble the package without sending — the pre-delivery preview. */
export async function assembleResponsePackage(organizationId: string, requestId: string): Promise<ResponsePackage> {
  const req = await prisma.dataSubjectRequest.findFirst({ where: { id: requestId, organizationId }, select: { id: true } });
  if (!req) throw new Error("Request not found");
  const [items, locations] = await Promise.all([
    prisma.dSARReviewItem.findMany({ where: { requestId }, select: { title: true, sourceSystem: true, reviewDecision: true, finalRelevant: true, redact: true, redactionNote: true } }),
    prisma.dSARDataLocation.count({ where: { requestId, found: true } }),
  ]);
  return buildResponsePackage(requestId, items as PackItem[], locations, new Date());
}

export class DsarDeliveryBlockedError extends Error {
  constructor(message: string) { super(message); this.name = "DsarDeliveryBlockedError"; }
}

export interface DeliverDsarInput {
  channel?: string; // "portal" (default) | "email-attachment" | "post"
  expiresInDays?: number;
}

export interface DeliverDsarResult {
  request: DsarDetailDTO;
  package: ResponsePackage;
  portalUrl: string;
  emailDelivered: boolean;
}

/** Assemble, deliver, and close the request. */
export async function deliverDsar(organizationId: string, requestId: string, input: DeliverDsarInput, actor: Actor): Promise<DeliverDsarResult> {
  const req = await prisma.dataSubjectRequest.findFirst({
    where: { id: requestId, organizationId },
    include: { requesterPerson: { select: { name: true, email: true } } },
  });
  if (!req) throw new Error("Request not found");
  if (req.status === "FULFILLED") throw new DsarDeliveryBlockedError("This request has already been fulfilled.");
  if (["REJECTED", "WITHDRAWN"].includes(req.status)) throw new DsarDeliveryBlockedError(`This request is ${req.status}.`);

  const pendingCount = await prisma.dSARReviewItem.count({ where: { requestId, reviewDecision: "PENDING" } });
  if (pendingCount > 0) throw new DsarDeliveryBlockedError(`${pendingCount} review item(s) are still pending validation.`);

  if (req.requestType === "ERASURE" && req.holdConflictCount > 0 && !req.holdConflictOverrideReason) {
    throw new DsarDeliveryBlockedError(`${req.holdConflictCount} active legal hold(s) preserve this data subject's data — resolve or override before fulfilling an erasure.`);
  }

  const pkg = await assembleResponsePackage(organizationId, requestId);
  const now = new Date();
  const channel = input.channel || "portal";

  // Mint a delivery token for the login-less portal.
  const rawToken = generateRawToken();
  const days = input.expiresInDays && input.expiresInDays > 0 ? input.expiresInDays : 30;
  await prisma.dSARAccessToken.create({
    data: { organizationId, requestId, tokenHash: hashToken(rawToken), purpose: "DELIVERY", expiresAt: new Date(now.getTime() + days * 86_400_000), createdById: actor.id },
  });
  const url = portalUrl(rawToken);

  // Close the request.
  await prisma.dataSubjectRequest.update({
    where: { id: requestId },
    data: {
      status: "FULFILLED",
      completedAt: now,
      deliveredAt: now,
      deliveryChannel: channel,
      response: { includedCount: pkg.includedCount, redactedCount: pkg.redactedCount, excludedCount: pkg.excludedCount, assembledAt: pkg.assembledAt } as never,
    },
  });

  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "privacy.dsar.fulfilled", resourceType: "DataSubjectRequest", resourceId: requestId,
    beforeJson: { status: req.status } as never,
    afterJson: { status: "FULFILLED", channel, includedCount: pkg.includedCount, redactedCount: pkg.redactedCount } as never,
    metadata: { source: "privacy", requestType: req.requestType } as never,
  });

  // Email the subject the secure link — best-effort, chain-sealed.
  let emailDelivered = false;
  const to = req.requesterPerson?.email;
  if (to) {
    const { html, text } = renderBasicEmail({
      heading: "Your data request is ready",
      paragraphs: [
        `${req.requesterPerson?.name ?? "Hello"}, your ${req.requestType.toLowerCase()} request has been completed.`,
        "Use the secure link below to view the response. The link is personal to you — please do not forward it.",
      ],
      button: { label: "View your response", url },
      footnote: `This link expires in ${days} days.`,
    });
    const result = await sendEmail({ to, subject: "Your data subject request is ready", html, text }).catch(() => ({ delivered: false, provider: "none" as const }));
    emailDelivered = result.delivered;
    await logAudit({
      organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
      action: emailDelivered ? "privacy.dsar.delivery_email_sent" : "privacy.dsar.delivery_email_not_delivered",
      resourceType: "DataSubjectRequest", resourceId: requestId,
      afterJson: { to, provider: result.provider, delivered: emailDelivered } as never,
      metadata: { source: "privacy", channel: "email" } as never,
    }).catch(() => {});
  }

  const request = (await getDsarDetail(organizationId, requestId))!;
  return { request, package: pkg, portalUrl: url, emailDelivered };
}
