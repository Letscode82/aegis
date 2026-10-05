/**
 * POST /api/one-legal/run-ladder — OL-6.
 *
 * Start one of the 10 GOVERNANCE_LIBRARY governance ladders directly from the
 * ONE Legal console. This is the "run a skill" path for the ladder-kind skills
 * in the console catalog: the user picks "NDA Fast-Track" (etc.) and a governed
 * WorkflowInstance begins.
 *
 * Governance is unchanged by this route. Starting a ladder only creates the
 * tracked governed process; the workflow engine still enforces that AGENT steps
 * queue a PENDING task and never auto-advance, and every transition twin-records
 * a chain-sealed AuditLog row. The console host entity
 * ("one_legal_console", <uuid>) is a free-form (entityType, entityId) pair —
 * WorkflowInstance does not FK those columns — so a console-started ladder is a
 * first-class, isolated run.
 *
 * Gated `intake:create_ticket` — the same gate as every other console route;
 * starting governed work from the console is consistent with filing an intake
 * ticket. The ladder key is validated against GOVERNANCE_LIBRARY before any
 * write, and the org's library is seeded on demand (idempotent) so a fresh org
 * can start a ladder without a separate admin seed step.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "node:crypto";
import { Permission, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { logAudit } from "@aegis/db";
import {
  GOVERNANCE_LIBRARY,
  seedWorkflowLibrary,
  startWorkflow,
  getWorkflowInstance,
  ragFor,
  WorkflowError,
} from "@aegis/workflow";
import { assertAndAudit } from "../../../lib/authz";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  const ladderKey = typeof req.body?.ladderKey === "string" ? req.body.ladderKey : "";
  const spec = GOVERNANCE_LIBRARY.find((l) => l.key === ladderKey);
  if (!spec) {
    return res.status(400).json({ ok: false, error: `Unknown governance ladder '${ladderKey}'` });
  }

  try {
    await assertAndAudit(user, Permission.IntakeCreateTicket, { route: "one-legal.run-ladder" });

    const entityType = "one_legal_console";
    const entityId = randomUUID();

    const start = () =>
      startWorkflow({
        organizationId: user.organizationId,
        definitionKey: ladderKey,
        entityType,
        entityId,
        startedById: user.id,
        context: { source: "one_legal_console", ladderKey },
      });

    let instance;
    try {
      instance = await start();
    } catch (err) {
      // Fresh org whose library has not been seeded yet — seed once and retry.
      if (err instanceof WorkflowError && err.status === 404) {
        await seedWorkflowLibrary(user.organizationId);
        instance = await start();
      } else {
        throw err;
      }
    }

    // getWorkflowInstance returns the rich shape (definition + transitions)
    // ragFor needs; fall back to the bare start result for the scalar fields.
    const full = await getWorkflowInstance(instance.id);

    await logAudit({
      organizationId: user.organizationId,
      actorId: user.id,
      actorType: "USER",
      action: "workflow.instance.started",
      resourceType: "WorkflowInstance",
      resourceId: instance.id,
      afterJson: { ladderKey, name: spec.name, entityType, entityId },
      metadata: { source: "one_legal_console" },
    });

    return res.status(200).json({
      ok: true,
      instance: {
        id: instance.id,
        ladderKey,
        name: spec.name,
        status: (full ?? instance).status,
        currentStepOrder: (full ?? instance).currentStepOrder ?? null,
        entityType,
        entityId,
        rag: full ? ragFor(full) : null,
      },
    });
  } catch (err) {
    if (err instanceof AccessDeniedError)
      return res.status(403).json({ ok: false, error: err.decision.message });
    if (err instanceof WorkflowError)
      return res.status(err.status).json({ ok: false, error: err.message });
    return res.status(500).json({ ok: false, error: "Could not start the governance ladder." });
  }
}
