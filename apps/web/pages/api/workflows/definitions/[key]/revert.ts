/**
 * POST /api/workflows/definitions/[key]/revert — revert a definition
 * to a prior version's steps. Admin config surface (admin:manage_users,
 * same gate as saving a definition). Body: { version }.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { revertWorkflowToVersion, WorkflowError } from "@aegis/workflow";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  try {
    assertUserCanDo(user, Permission.AdminManageUsers);
  } catch (err) {
    if (err instanceof AccessDeniedError)
      return res.status(403).json({ ok: false, error: err.decision.message });
    throw err;
  }
  const version = Number(req.body?.version);
  if (!Number.isInteger(version) || version < 1)
    return res.status(400).json({ ok: false, error: "version (positive integer) is required" });
  try {
    const definition = await revertWorkflowToVersion({
      organizationId: user.organizationId,
      key: String(req.query.key),
      version,
      savedById: user.id,
    });
    return res.status(200).json({ ok: true, definition });
  } catch (err) {
    if (err instanceof WorkflowError)
      return res.status(err.status).json({ ok: false, error: err.message });
    throw err;
  }
}
