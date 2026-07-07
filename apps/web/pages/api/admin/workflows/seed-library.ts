/**
 * POST /api/admin/workflows/seed-library — idempotently seed the
 * 10-ladder governance workflow library for the caller's org
 * (defineWorkflow upserts on (org, key)). Gated admin:manage_users,
 * same as the other admin config surfaces. Audited.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { logAudit } from "@aegis/db";
import { seedWorkflowLibrary } from "@aegis/workflow";

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

  const keys = await seedWorkflowLibrary(user.organizationId);
  await logAudit({
    organizationId: user.organizationId,
    actorId: user.id,
    actorType: "USER",
    action: "workflow.library.seeded",
    resourceType: "WorkflowDefinition",
    resourceId: "governance-library",
    afterJson: { keys },
    metadata: { source: "admin" },
  });
  return res.status(200).json({ ok: true, keys });
}
