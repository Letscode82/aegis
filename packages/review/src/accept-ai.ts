/**
 * "Accept all AI calls" — a one-click bulk-code that applies the AI's tag
 * decisions to every still-uncoded, non-excluded, AI-routed document. It is a
 * human-initiated action (a reviewer clicks the button), so the coding gate is
 * preserved — the AI never finalizes on its own. Chain-sealed.
 *
 * `onlyConfident` fails closed: documents whose RESPONSIVE call is below the
 * confidence threshold (or uncited) are left PENDING for a human, matching the
 * AIR-4 apply-at-scale philosophy.
 */
import { prisma, logAudit } from "@aegis/db";
import { parseAiTags } from "./ai-tags";

export type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

export interface AcceptAiResult {
  applied: number;
  responsive: number;
  notResponsive: number;
  privileged: number;
  failClosed: number;
}

export async function acceptAllAiCalls(
  organizationId: string,
  reviewSetId: string,
  actor: Actor,
  opts: { onlyConfident?: boolean; threshold?: number } = {},
): Promise<AcceptAiResult> {
  const rs = await prisma.reviewSet.findFirst({ where: { id: reviewSetId, organizationId }, select: { id: true } });
  if (!rs) throw new Error("Review set not found");
  const threshold = opts.threshold ?? 0.7;

  const items = await prisma.reviewSetItem.findMany({
    where: { reviewSetId, excludedAt: null, reviewDecision: "PENDING", aiRoute: { not: null } },
    select: { id: true, aiTags: true, aiVerdict: true },
  });

  const out: AcceptAiResult = { applied: 0, responsive: 0, notResponsive: 0, privileged: 0, failClosed: 0 };
  const now = new Date();
  for (const it of items) {
    const tags = parseAiTags(it.aiTags);
    const resp = tags.find((t) => t.kind === "RESPONSIVE");
    const priv = tags.find((t) => t.kind === "PRIVILEGED");
    // Fail closed: skip uncited or low-confidence responsive calls when asked.
    if (opts.onlyConfident && (!resp || resp.confidence < threshold || !resp.citation)) {
      out.failClosed += 1;
      continue;
    }
    const isResp = resp ? resp.value : it.aiVerdict === "RELEVANT";
    const isPriv = priv ? priv.value : false;
    await prisma.reviewSetItem.update({
      where: { id: it.id },
      data: {
        codedResponsive: isResp,
        codedPrivileged: isPriv,
        reviewDecision: "CONFIRMED",
        reviewedById: actor.id,
        reviewedAt: now,
        reviewNote: opts.onlyConfident ? "Accepted confident AI call (bulk)" : "Accepted AI call (bulk)",
      },
    });
    out.applied += 1;
    if (isResp) out.responsive += 1; else out.notResponsive += 1;
    if (isPriv) out.privileged += 1;
  }

  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.ai_calls.accepted", resourceType: "ReviewSet", resourceId: reviewSetId,
    afterJson: { ...out, onlyConfident: !!opts.onlyConfident } as never,
    metadata: { source: "review", channel: "ediscovery" } as never,
  });
  return out;
}
