/**
 * CAP-4 — governed agentic actions. The copilot / Case Graph can *propose*
 * actions on the collection, but only through the governance harness: every
 * proposal writes a PENDING `AgentDecision`, a human approves it, and only the
 * approve path executes the mutation and chain-seals it (linking the resulting
 * AuditLog id back onto the decision). The AI never mutates state on its own —
 * this is conservative AI governance enforced in the persistence layer, and the
 * first time the `AgentDecision` contract runs on the review side.
 */
import { prisma, logAudit, AgentApprovalStatus } from "@aegis/db";

export type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

export type AgentActionKind = "code-reviewer-responsive";

export interface AgentProposalDTO {
  id: string;
  kind: AgentActionKind | string;
  description: string;
  count: number;
  status: string;
  createdAt: string;
  approvedByName?: string | null;
}

const AGENT_NAME = "case-copilot";

interface Recommendation { kind: AgentActionKind; description: string; itemIds: string[]; count: number }

function toDTO(d: { id: string; recommendationJson: unknown; approvalStatus: string; createdAt: Date }, approvedByName?: string | null): AgentProposalDTO {
  const r = (d.recommendationJson as Recommendation | null) ?? { kind: "code-reviewer-responsive", description: "", itemIds: [], count: 0 };
  return { id: d.id, kind: r.kind, description: r.description, count: r.count, status: d.approvalStatus, createdAt: d.createdAt.toISOString(), approvedByName };
}

/** Propose an action over the collection — writes a PENDING AgentDecision.
 *  Today: tag the AI's REVIEWER-routed, still-uncoded documents as responsive.
 *  Nothing is applied until a human approves. */
export async function proposeAgentAction(organizationId: string, reviewSetId: string, kind: AgentActionKind, actor: Actor): Promise<AgentProposalDTO> {
  const rs = await prisma.reviewSet.findFirst({ where: { id: reviewSetId, organizationId }, select: { id: true } });
  if (!rs) throw new Error("Review set not found");
  if (kind !== "code-reviewer-responsive") throw new Error(`Unknown action kind: ${kind}`);

  const targets = await prisma.reviewSetItem.findMany({
    where: { reviewSetId, excludedAt: null, aiRoute: "REVIEWER", reviewDecision: "PENDING" },
    select: { id: true },
  });
  if (targets.length === 0) throw new Error("No REVIEWER-routed, uncoded documents to act on.");
  const itemIds = targets.map((t) => t.id);
  const recommendation: Recommendation = {
    kind, description: `Tag ${itemIds.length} AI-reviewer-routed document(s) as responsive (pending your approval).`, itemIds, count: itemIds.length,
  };

  const decision = await prisma.agentDecision.create({
    data: {
      organizationId, agentName: AGENT_NAME, modelId: "deterministic", modelVersion: "cap4-v1",
      promptHash: "n/a", recommendationJson: recommendation as never, confidence: null,
      approvalStatus: AgentApprovalStatus.PENDING, resourceType: "ReviewSet", resourceId: reviewSetId,
    },
  });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.agent_action.proposed", resourceType: "AgentDecision", resourceId: decision.id,
    afterJson: { kind, count: itemIds.length, reviewSetId } as never,
    metadata: { source: "review", channel: "case-copilot" } as never,
  });
  return toDTO(decision);
}

export async function listAgentProposals(organizationId: string, reviewSetId: string): Promise<AgentProposalDTO[]> {
  const rows = await prisma.agentDecision.findMany({
    where: { organizationId, resourceType: "ReviewSet", resourceId: reviewSetId, agentName: AGENT_NAME },
    orderBy: [{ createdAt: "desc" }],
    include: { approvedBy: { select: { name: true } } },
    take: 25,
  });
  return rows.map((d) => toDTO(d, d.approvedBy?.name ?? null));
}

/** Approve a proposal → EXECUTE the mutation + chain-seal it, linking the
 *  AuditLog id onto the decision. The only path that applies the action. */
export async function approveAgentAction(organizationId: string, decisionId: string, actor: Actor): Promise<AgentProposalDTO> {
  const decision = await prisma.agentDecision.findFirst({ where: { id: decisionId, organizationId, agentName: AGENT_NAME } });
  if (!decision) throw new Error("Proposal not found");
  if (decision.approvalStatus !== AgentApprovalStatus.PENDING) throw new Error(`Proposal already ${decision.approvalStatus}.`);
  const rec = decision.recommendationJson as unknown as Recommendation;

  let applied = 0;
  if (rec.kind === "code-reviewer-responsive") {
    const r = await prisma.reviewSetItem.updateMany({
      where: { id: { in: rec.itemIds }, reviewDecision: "PENDING" },
      data: { codedResponsive: true, reviewDecision: "CONFIRMED", reviewedById: actor.id, reviewedAt: new Date(), reviewNote: `Approved agent action ${decisionId}` },
    });
    applied = r.count;
  }

  const auditId = await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.agent_action.approved", resourceType: "ReviewSet", resourceId: decision.resourceId ?? "",
    afterJson: { kind: rec.kind, applied } as never,
    metadata: { source: "review", channel: "case-copilot", agentDecisionId: decisionId } as never,
  });
  const updated = await prisma.agentDecision.update({
    where: { id: decisionId },
    data: { approvalStatus: AgentApprovalStatus.APPROVED, approvedById: actor.id, approvedAt: new Date(), resultingAuditLogId: auditId ?? null },
    include: { approvedBy: { select: { name: true } } },
  });
  return toDTO(updated, updated.approvedBy?.name ?? null);
}

export async function rejectAgentAction(organizationId: string, decisionId: string, actor: Actor): Promise<AgentProposalDTO> {
  const decision = await prisma.agentDecision.findFirst({ where: { id: decisionId, organizationId, agentName: AGENT_NAME }, select: { id: true, approvalStatus: true } });
  if (!decision) throw new Error("Proposal not found");
  if (decision.approvalStatus !== AgentApprovalStatus.PENDING) throw new Error(`Proposal already ${decision.approvalStatus}.`);
  const updated = await prisma.agentDecision.update({
    where: { id: decisionId },
    data: { approvalStatus: AgentApprovalStatus.REJECTED, approvedById: actor.id, approvedAt: new Date() },
    include: { approvedBy: { select: { name: true } } },
  });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "reviewset.agent_action.rejected", resourceType: "AgentDecision", resourceId: decisionId,
    metadata: { source: "review", channel: "case-copilot" } as never,
  });
  return toDTO(updated, updated.approvedBy?.name ?? null);
}
