/**
 * AgentDecision lifecycle for intake (Intake P2b — conservative-AI
 * governance goes live).
 *
 * The AgentDecision table was locked in 4b but shipped empty: the
 * promise "no AI action without human approval" was enforced in the UI,
 * not the schema. This module makes it a database fact for the intake
 * side:
 *
 *   1. Every agent recommendation writes a PENDING AgentDecision row.
 *   2. The attorney's approve keystroke is the ONLY path to APPROVED
 *      (APPROVED_WITH_OVERRIDE when they edited the draft first).
 *   3. Reject → REJECTED.
 *   4. Downstream mutations (matter auto-spawn) gate on the decision
 *      being APPROVED — a ticket whose decision is still PENDING or was
 *      REJECTED will not spawn a matter, even if some other path flips
 *      the ticket's flags.
 *
 * Decisions are append-then-resolve: created once when the rec first
 * appears, updated in place on resolution, NEVER deleted (unlike
 * AgentRecommendation, which is replaced on every save). The row is the
 * evidence record.
 *
 * Server-only. Attaches via the polymorphic (resourceType, resourceId)
 * pair = ("IntakeTicket", ticketId).
 */
import {
  prisma,
  sha256Hex,
  AgentApprovalStatus,
  type AgentDecision,
} from "@aegis/db";
import { CLAUDE_MODEL } from "@aegis/ai";

const RESOURCE_TYPE = "IntakeTicket";

interface RecLike {
  agentId?: string;
  confidence?: number;
  suggestedAction?: string;
  draftedResponse?: string;
  reasoning?: string;
  mock?: boolean;
}

/** The four triage actions that resolve a decision. Anything else
 * (reassign / snooze / manual-close) leaves it PENDING — those aren't
 * a verdict on the agent's recommendation. */
type ResolvingAction = "approved" | "edited-approved" | "rejected";
function resolvingStatus(action: ResolvingAction): AgentApprovalStatus {
  if (action === "rejected") return AgentApprovalStatus.REJECTED;
  if (action === "edited-approved")
    return AgentApprovalStatus.APPROVED_WITH_OVERRIDE;
  return AgentApprovalStatus.APPROVED;
}

function isApproved(status: AgentApprovalStatus): boolean {
  return (
    status === AgentApprovalStatus.APPROVED ||
    status === AgentApprovalStatus.APPROVED_WITH_OVERRIDE
  );
}

/** Find the most recent decision governing a ticket, if any. */
export async function getAgentDecisionForTicket(
  organizationId: string,
  ticketId: string,
): Promise<AgentDecision | null> {
  return prisma.agentDecision.findFirst({
    where: { organizationId, resourceType: RESOURCE_TYPE, resourceId: ticketId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Idempotently sync the AgentDecision for a ticket against the current
 * recommendation + triage action. Called once per ticket per save when a
 * recommendation is present.
 *
 *   - no decision yet, no resolving action → create PENDING
 *   - no decision yet, resolving action    → create already-resolved
 *     (covers approve-in-same-save, e.g. bulk approve)
 *   - PENDING decision, resolving action   → flip to resolved
 *   - already-resolved decision            → no-op (the verdict stands)
 *
 * Returns `{ approved }` so the caller can gate downstream mutations.
 */
export async function syncAgentDecisionForTicket(input: {
  organizationId: string;
  ticketId: string;
  rec: RecLike;
  /** The newly-transitioning triage action, or null on a non-review save. */
  action?: string | null;
  /** Auth0-resolved approver (User.id) when resolving. */
  actorId?: string | null;
  /** AuditLog row id of the approval/reject row, for evidence linkage. */
  auditLogId?: string | null;
}): Promise<{ approved: boolean; decision: AgentDecision | null }> {
  const { organizationId, ticketId, rec, action, actorId, auditLogId } = input;
  const resolving =
    action === "approved" || action === "edited-approved" || action === "rejected"
      ? (action as ResolvingAction)
      : null;

  const existing = await getAgentDecisionForTicket(organizationId, ticketId);

  // Already resolved — the verdict is immutable. No-op.
  if (existing && existing.approvalStatus !== AgentApprovalStatus.PENDING) {
    return { approved: isApproved(existing.approvalStatus), decision: existing };
  }

  const promptHash = sha256Hex(
    `${rec.agentId ?? "unknown"}::${rec.draftedResponse ?? ""}::${rec.reasoning ?? ""}`,
  );
  const recommendationJson = {
    agentId: rec.agentId ?? "unknown-agent",
    suggestedAction: rec.suggestedAction ?? "review",
    confidence: rec.confidence ?? null,
    reasoning: rec.reasoning ?? "",
    degraded: rec.mock === true,
  };

  // Resolve an existing PENDING decision.
  if (existing) {
    if (!resolving) {
      return { approved: false, decision: existing }; // still pending
    }
    const status = resolvingStatus(resolving);
    const updated = await prisma.agentDecision.update({
      where: { id: existing.id },
      data: {
        approvalStatus: status,
        approvedById: resolving === "rejected" ? null : actorId ?? null,
        approvedAt: new Date(),
        resultingAuditLogId: auditLogId ?? null,
        overrideReason:
          resolving === "edited-approved"
            ? "Attorney edited the drafted response before approval."
            : null,
        recommendationJson: recommendationJson as never,
      },
    });
    return { approved: isApproved(status), decision: updated };
  }

  // No decision yet — create one in the right state.
  const status = resolving ? resolvingStatus(resolving) : AgentApprovalStatus.PENDING;
  const created = await prisma.agentDecision.create({
    data: {
      organizationId,
      resourceType: RESOURCE_TYPE,
      resourceId: ticketId,
      agentName: rec.agentId ?? "unknown-agent",
      modelId: CLAUDE_MODEL,
      // Records whether the recommendation was AI-generated or a degraded
      // (Claude-unavailable) template fallback — visible in the evidence.
      modelVersion: rec.mock === true ? "degraded-fallback" : "live",
      promptHash,
      recommendationJson: recommendationJson as never,
      confidence: rec.confidence ?? null,
      approvalStatus: status,
      approvedById: resolving && resolving !== "rejected" ? actorId ?? null : null,
      approvedAt: resolving ? new Date() : null,
      resultingAuditLogId: resolving ? auditLogId ?? null : null,
      overrideReason:
        resolving === "edited-approved"
          ? "Attorney edited the drafted response before approval."
          : null,
    },
  });
  return { approved: isApproved(status), decision: created };
}

/**
 * The gate. Returns whether downstream AI-driven mutations may proceed
 * for this ticket:
 *   - no decision exists (human-only / no-agent ticket) → allowed
 *     (this path was never AI-recommended, so there's nothing to gate)
 *   - decision exists → allowed ONLY if APPROVED / APPROVED_WITH_OVERRIDE
 */
export async function isTicketAgentActionApproved(
  organizationId: string,
  ticketId: string,
): Promise<{ gated: boolean; approved: boolean }> {
  const decision = await getAgentDecisionForTicket(organizationId, ticketId);
  if (!decision) return { gated: false, approved: true };
  return { gated: true, approved: isApproved(decision.approvalStatus) };
}
