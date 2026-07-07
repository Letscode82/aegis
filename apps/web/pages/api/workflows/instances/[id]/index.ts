/**
 * GET /api/workflows/instances/[id] — instance + steps + transitions
 * + RAG strip. Org-scoped read for any authenticated user.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getResolvedUser } from "@aegis/auth/server";
import { getWorkflowInstance } from "@aegis/workflow";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  const instance = await getWorkflowInstance(String(req.query.id));
  if (!instance || instance.organizationId !== user.organizationId)
    return res.status(404).json({ ok: false, error: "Workflow instance not found" });
  return res.status(200).json({ ok: true, instance });
}
