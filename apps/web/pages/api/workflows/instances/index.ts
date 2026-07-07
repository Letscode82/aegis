/**
 * /api/workflows/instances
 *
 * POST — start an instance on a host entity. Generic-surface starts
 *        are admin-gated (admin:manage_users): host modules start
 *        their own instances server-side inside their mutation
 *        chokepoints with their own permission gates (W-C wires
 *        intake); this route exists for admin/demo orchestration.
 * GET  — list instances for an entity
 *        (?entityType=…&entityId=…, any authenticated user in org).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import {
  listInstancesForEntity,
  ragFor,
  startWorkflow,
  WorkflowError,
} from "@aegis/workflow";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  if (req.method === "GET") {
    const { entityType, entityId } = req.query;
    if (typeof entityType !== "string" || typeof entityId !== "string")
      return res.status(400).json({ ok: false, error: "entityType and entityId are required" });
    const instances = await listInstancesForEntity(user.organizationId, entityType, entityId);
    return res.status(200).json({
      ok: true,
      instances: instances.map((i) => ({ ...i, rag: ragFor(i) })),
    });
  }

  if (req.method === "POST") {
    try {
      assertUserCanDo(user, Permission.AdminManageUsers);
    } catch (err) {
      if (err instanceof AccessDeniedError)
        return res.status(403).json({ ok: false, error: err.decision.message });
      throw err;
    }
    try {
      const { definitionKey, entityType, entityId, context } = req.body ?? {};
      if (
        typeof definitionKey !== "string" ||
        typeof entityType !== "string" ||
        typeof entityId !== "string"
      )
        return res
          .status(400)
          .json({ ok: false, error: "definitionKey, entityType and entityId are required" });
      const instance = await startWorkflow({
        organizationId: user.organizationId,
        definitionKey,
        entityType,
        entityId,
        startedById: user.id,
        context: context && typeof context === "object" ? context : {},
      });
      return res.status(200).json({ ok: true, instance });
    } catch (err) {
      if (err instanceof WorkflowError)
        return res.status(err.status).json({ ok: false, error: err.message });
      throw err;
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
