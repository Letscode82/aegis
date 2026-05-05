/**
 * POST /api/admin/jobs/m365-device-code-cleanup
 *
 * Prunes expired / completed Device Code OAuth sessions older than
 * 24 hours. Sessions are tiny (< 1 KB each) so this is opportunistic
 * cleanup — no harm in skipping. The poll endpoint is happy with
 * old rows still in the table; this just trims the index.
 *
 * Triggered manually from the /admin/legal-hold/jobs page or by an
 * external scheduler. Sub-PR 4c.1 follow-up.
 *
 * Permission: admin:m365:manage OR admin:manage_users.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { pruneOldDeviceCodeSessions } from "@aegis/matter";
import { requireActorAny } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActorAny(req, res, [
    Permission.AdminM365Manage,
    Permission.AdminManageUsers,
  ]);
  if (!actor) return;
  try {
    const result = await pruneOldDeviceCodeSessions(actor.organizationId);
    return res.status(200).json(result);
  } catch (err) {
    console.error("[jobs/m365-device-code-cleanup] failed:", err);
    return res
      .status(500)
      .json({ error: String((err as Error)?.message ?? err) });
  }
}
