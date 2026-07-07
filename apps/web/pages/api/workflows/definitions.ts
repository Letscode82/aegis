/**
 * /api/workflows/definitions — ladder templates.
 *
 * GET  — list active definitions (any authenticated user; pickers and
 *        the Cockpit RAG strip need names + step shapes).
 * POST — create/replace a definition. Admin config surface, gated on
 *        admin:manage_users (same gate as the request-types admin
 *        namespace it sits beside).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { defineWorkflow, listWorkflowDefinitions, WorkflowError } from "@aegis/workflow";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  if (req.method === "GET") {
    const definitions = await listWorkflowDefinitions(user.organizationId, {
      includeInactive: req.query.includeInactive === "true",
    });
    return res.status(200).json({ ok: true, definitions });
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
      const { key, name, description, steps } = req.body ?? {};
      if (typeof key !== "string" || typeof name !== "string" || !Array.isArray(steps))
        return res.status(400).json({ ok: false, error: "key, name and steps[] are required" });
      const definition = await defineWorkflow({
        organizationId: user.organizationId,
        key,
        name,
        description: typeof description === "string" ? description : null,
        steps,
      });
      return res.status(200).json({ ok: true, definition });
    } catch (err) {
      if (err instanceof WorkflowError)
        return res.status(err.status).json({ ok: false, error: err.message });
      throw err;
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
