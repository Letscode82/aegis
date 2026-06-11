/**
 * /api/intake/routing-rules/[id]
 *
 *   PUT     → full rule patch (any subset of editable fields)
 *   DELETE  → remove the rule
 *
 * Both gated on admin:manage_users (the editor surface). The PUT
 * handler still accepts the toggle-only shape `{ enabled }` the
 * Smart Routing tab uses today — those toggles round-trip through
 * the same `updateRoutingRule` service that the editor uses, so
 * there's one audit pattern (intake.routing_rule.updated) for
 * every kind of change.
 *
 * A future PR introduces a dedicated `intake:routing_rules_manage`
 * permission; until then admin:manage_users is the smallest
 * existing scope that fits.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  deleteRoutingRule,
  RoutingRuleNotFoundError,
  RoutingRuleValidationError,
  updateRoutingRule,
} from "@aegis/intake/routing";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const id = typeof req.query.id === "string" ? req.query.id : null;
  if (!id) {
    return res.status(400).json({ error: "rule id is required" });
  }

  if (req.method === "PUT") {
    const actor = await requireActor(req, res, Permission.AdminManageUsers);
    if (!actor) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const rule = await updateRoutingRule(
        actor.organizationId,
        id,
        body,
        { req, res },
      );
      return res.status(200).json({ rule });
    } catch (err) {
      if (err instanceof RoutingRuleNotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      if (err instanceof RoutingRuleValidationError) {
        return res.status(400).json({ error: err.message });
      }
      console.error("[/api/intake/routing-rules/[id] PUT] failed:", err);
      return res.status(500).json({ error: "Internal error" });
    }
  }

  if (req.method === "DELETE") {
    const actor = await requireActor(req, res, Permission.AdminManageUsers);
    if (!actor) return;
    try {
      await deleteRoutingRule(actor.organizationId, id, { req, res });
      return res.status(204).end();
    } catch (err) {
      if (err instanceof RoutingRuleNotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      console.error("[/api/intake/routing-rules/[id] DELETE] failed:", err);
      return res.status(500).json({ error: "Internal error" });
    }
  }

  res.setHeader("Allow", "PUT,DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
