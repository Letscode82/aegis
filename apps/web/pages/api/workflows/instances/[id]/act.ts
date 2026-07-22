/**
 * POST /api/workflows/instances/[id]/act — approve / reject /
 * send_back / cancel the instance's current step.
 *
 * Per-step RBAC: when the current step declares an approverRole, the
 * actor's role name must match it (platform admins may always act —
 * the same override the admin module grants). Steps without an
 * approverRole accept any authenticated org member. The optimistic
 * expectedVersion from the client is passed through so stale
 * double-approvals 409.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getResolvedUser } from "@aegis/auth/server";
import {
  actOnWorkflow,
  getWorkflowInstance,
  ragFor,
  WorkflowError,
} from "@aegis/workflow";
import { runLadderAgentForTicket } from "@aegis/intake/agent-run";

const ACTIONS = new Set(["approve", "reject", "send_back", "cancel"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  const instance = await getWorkflowInstance(String(req.query.id));
  if (!instance || instance.organizationId !== user.organizationId)
    return res.status(404).json({ ok: false, error: "Workflow instance not found" });

  const { action, comment, targetStep, expectedVersion } = req.body ?? {};
  if (typeof action !== "string" || !ACTIONS.has(action))
    return res.status(400).json({ ok: false, error: "action must be approve | reject | send_back | cancel" });

  const currentStep = instance.definition.steps.find(
    (s) => s.stepOrder === instance.currentStepOrder,
  );
  if (currentStep?.approverRole && user.roleName !== "admin" && user.roleName !== currentStep.approverRole) {
    return res.status(403).json({
      ok: false,
      error: `This step is assigned to the '${currentStep.approverRole}' role`,
    });
  }

  try {
    const after = await actOnWorkflow({
      instanceId: instance.id,
      action: action as "approve" | "reject" | "send_back" | "cancel",
      actor: user.id,
      comment: typeof comment === "string" ? comment : null,
      targetStep: typeof targetStep === "number" ? targetStep : null,
      expectedVersion: typeof expectedVersion === "number" ? expectedVersion : null,
    });
    const refreshed = (await getWorkflowInstance(after.id)) ?? after;
    // If the ladder just advanced onto an AGENT step, run the bound agent
    // automatically and persist its recommendation onto the ticket, so the
    // Cockpit surfaces it with no "run" button. Governance unchanged — it
    // writes a PENDING AgentDecision; the human still approves the step.
    const nowStep = refreshed.definition?.steps?.find((s) => s.stepOrder === refreshed.currentStepOrder);
    if (refreshed.status === "IN_PROGRESS" && nowStep?.kind === "AGENT" && instance.entityType === "intake_ticket") {
      await runLadderAgentForTicket(user.organizationId, instance.entityId).catch(() => {});
    }
    return res.status(200).json({ ok: true, instance: { ...refreshed, rag: ragFor(refreshed) } });
  } catch (err) {
    if (err instanceof WorkflowError)
      return res.status(err.status).json({ ok: false, error: err.message });
    throw err;
  }
}
