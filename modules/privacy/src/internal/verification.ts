/**
 * Identity verification (the "Authenticate" phase). A DSAR must not disclose
 * personal data until the requester is confirmed to be the data subject.
 * Recording an outcome flips DSARVerificationStatus and is chain-sealed; a
 * VERIFIED result is the gate requests.ts checks before collection starts.
 */
import { prisma, logAudit } from "@aegis/db";
import type { DSARVerificationStatus } from "@aegis/db";
import { getDsarDetail, type Actor, type DsarDetailDTO } from "./requests";

export interface RecordVerificationInput {
  outcome: DSARVerificationStatus; // IN_PROGRESS | VERIFIED | FAILED
  method?: string | null; // "passport", "knowledge-based", "portal-login", …
  note?: string | null;
}

export async function recordDsarVerification(organizationId: string, requestId: string, input: RecordVerificationInput, actor: Actor): Promise<DsarDetailDTO> {
  const before = await prisma.dataSubjectRequest.findFirst({ where: { id: requestId, organizationId }, select: { verificationStatus: true, status: true } });
  if (!before) throw new Error("Request not found");

  const now = new Date();
  const verified = input.outcome === "VERIFIED";
  await prisma.dataSubjectRequest.update({
    where: { id: requestId },
    data: {
      verificationStatus: input.outcome,
      verificationMethod: input.method ?? null,
      verifiedAt: verified ? now : null,
      // First verification nudges a RECEIVED request into VERIFYING.
      ...(before.status === "RECEIVED" && { status: "VERIFYING" }),
    },
  });

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
    action: "privacy.dsar.identity_verification",
    resourceType: "DataSubjectRequest",
    resourceId: requestId,
    beforeJson: { verificationStatus: before.verificationStatus } as never,
    afterJson: { verificationStatus: input.outcome, method: input.method ?? null, note: input.note ?? null } as never,
    metadata: { source: "privacy", outcome: input.outcome } as never,
  });

  return (await getDsarDetail(organizationId, requestId))!;
}
