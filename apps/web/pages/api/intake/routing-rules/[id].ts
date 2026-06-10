/**
 * PUT /api/intake/routing-rules/[id] — enable / disable a routing
 * rule. Body: { enabled: boolean }.
 *
 * Gated on admin:manage_users for now — toggling automation is a
 * platform-configuration act. P2a proper introduces a dedicated
 * intake-configuration permission and the full rule editor at
 * /admin/intake/routing-rules; this endpoint moves to it then.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  RoutingRuleNotFoundError,
  setRoutingRuleEnabled,
} from "@aegis/intake/routing";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "PUT") {
    res.setHeader("Allow", "PUT");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AdminManageUsers);
  if (!actor) return;

  const id = typeof req.query.id === "string" ? req.query.id : null;
  const body = (req.body ?? {}) as { enabled?: unknown };
  if (!id || typeof body.enabled !== "boolean") {
    return res
      .status(400)
      .json({ error: "rule id and boolean `enabled` are required" });
  }
  try {
    const rule = await setRoutingRuleEnabled(
      actor.organizationId,
      id,
      body.enabled,
      { req, res },
    );
    return res.status(200).json({ rule });
  } catch (err) {
    if (err instanceof RoutingRuleNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    console.error("[/api/intake/routing-rules/[id]] failed:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
