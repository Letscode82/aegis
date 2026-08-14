/**
 * Data-subject self-service portal (the "Centralized request portal" /
 * login-less intake + status tracking). A member of the public can file a
 * request (creating a source="portal" DSAR) and receive a tokenised tracking
 * link; the same token type, minted STATUS, lets them watch progress and a
 * DELIVERY token reveals the finished response summary. Validity + scope are
 * re-derived from the row every call — the token is the gate.
 */
import { prisma, logAudit } from "@aegis/db";
import type { DSARRequestType } from "@aegis/db";
import type { Actor } from "./requests";
import { createDsarRequest } from "./requests";
import { slaState } from "./sla";
import { stageIndex, DSAR_STAGES } from "./state-machine";
import { generateRawToken, hashToken, portalUrl, tokenUsable } from "./tokens";

const SYSTEM_ACTOR: Actor = { id: null, type: "SYSTEM" };

/** Mint a STATUS (default) or DELIVERY tracking token for a request. */
export async function mintDsarAccessToken(
  organizationId: string,
  requestId: string,
  opts: { purpose?: "STATUS" | "DELIVERY"; expiresInDays?: number },
  actor: Actor,
): Promise<{ rawToken: string; url: string; expiresAt: string }> {
  const req = await prisma.dataSubjectRequest.findFirst({ where: { id: requestId, organizationId }, select: { id: true } });
  if (!req) throw new Error("Request not found");
  const rawToken = generateRawToken();
  const days = opts.expiresInDays && opts.expiresInDays > 0 ? opts.expiresInDays : 45;
  const expiresAt = new Date(Date.now() + days * 86_400_000);
  await prisma.dSARAccessToken.create({
    data: { organizationId, requestId, tokenHash: hashToken(rawToken), purpose: opts.purpose ?? "STATUS", expiresAt, createdById: actor.id },
  });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
    action: "privacy.dsar.access_token_minted", resourceType: "DataSubjectRequest", resourceId: requestId,
    afterJson: { purpose: opts.purpose ?? "STATUS", expiresAt: expiresAt.toISOString() } as never, metadata: { source: "privacy" } as never,
  });
  return { rawToken, url: portalUrl(rawToken), expiresAt: expiresAt.toISOString() };
}

export interface PortalView {
  requestType: DSARRequestType;
  status: string;
  purpose: string;
  submittedAt: string;
  effectiveDeadline: string;
  daysRemaining: number;
  stage: { index: number; total: number; label: string };
  response: { includedCount: number; redactedCount: number; excludedCount: number } | null;
}

/** Resolve a raw token → the public-safe status view (null when invalid). */
export async function resolveDsarPortal(rawToken: string): Promise<PortalView | null> {
  if (!rawToken) return null;
  const token = await prisma.dSARAccessToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!token) return null;
  const now = new Date();
  if (!tokenUsable(token, now)) {
    if (token.status === "ACTIVE" && token.expiresAt.getTime() <= now.getTime()) {
      await prisma.dSARAccessToken.update({ where: { id: token.id }, data: { status: "EXPIRED" } });
    }
    return null;
  }
  const req = await prisma.dataSubjectRequest.findUnique({ where: { id: token.requestId } });
  if (!req) return null;

  if (!token.viewedAt) await prisma.dSARAccessToken.update({ where: { id: token.id }, data: { viewedAt: now } });

  const sla = slaState({ slaDeadline: req.slaDeadline, extendedDeadline: req.extendedDeadline }, now);
  const idx = stageIndex(req.status);
  const response = token.purpose === "DELIVERY" && req.response
    ? (req.response as { includedCount?: number; redactedCount?: number; excludedCount?: number })
    : null;

  return {
    requestType: req.requestType,
    status: req.status,
    purpose: token.purpose,
    submittedAt: req.submittedAt.toISOString(),
    effectiveDeadline: sla.effectiveDeadline.toISOString(),
    daysRemaining: sla.daysRemaining,
    stage: { index: idx < 0 ? DSAR_STAGES.length : idx, total: DSAR_STAGES.length, label: DSAR_STAGES[idx]?.label ?? (req.status.charAt(0) + req.status.slice(1).toLowerCase()) },
    response: response ? { includedCount: response.includedCount ?? 0, redactedCount: response.redactedCount ?? 0, excludedCount: response.excludedCount ?? 0 } : null,
  };
}

export interface SubmitPortalRequestInput {
  requestType: DSARRequestType;
  jurisdiction: string;
  requesterName: string;
  requesterEmail?: string | null;
  description?: string | null;
}

/** Public intake: create a source="portal" DSAR + return a tracking link. */
export async function submitPortalRequest(organizationId: string, input: SubmitPortalRequestInput): Promise<{ requestId: string; trackingUrl: string }> {
  const detail = await createDsarRequest(
    organizationId,
    {
      requestType: input.requestType,
      jurisdiction: input.jurisdiction,
      requesterName: input.requesterName,
      requesterEmail: input.requesterEmail ?? null,
      subjectSummary: input.description ?? null,
      source: "portal",
    },
    SYSTEM_ACTOR,
  );
  const token = await mintDsarAccessToken(organizationId, detail.id, { purpose: "STATUS" }, SYSTEM_ACTOR);
  return { requestId: detail.id, trackingUrl: token.url };
}
