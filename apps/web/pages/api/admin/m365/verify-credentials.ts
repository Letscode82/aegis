/**
 * GET  /api/admin/m365/verify-credentials
 *
 * Round-trips Graph /organization to confirm the resolved
 * credentials work. Updates lastVerifiedAt + lastErrorMessage on
 * the OrganizationM365Credential row when one exists. Permission-
 * gated to admin:manage_users (the same role that manages auth).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { verifyM365Credentials } from "@aegis/matter";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET,POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AdminM365Manage);
  if (!actor) return;
  try {
    const result = await verifyM365Credentials(actor.organizationId);
    return res.status(result.ok ? 200 : 502).json(result);
  } catch (err) {
    console.error("[/api/admin/m365/verify-credentials] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
