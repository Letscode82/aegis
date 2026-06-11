/**
 * /api/intake/routing-rules
 *
 *   GET  → list rules (read-gated on intake:read_all_tickets)
 *   POST → create a rule (write-gated on admin:manage_users; the
 *          full editor surface lives behind the same permission as
 *          the enable/disable toggle so creation, update, and delete
 *          share one governance gate)
 *
 * Both responses always go through the same Prisma chokepoint that
 * the chokepoint integration tests exercise — no parallel write
 * paths.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  createRoutingRule,
  listRoutingRules,
  RoutingRuleValidationError,
} from "@aegis/intake/routing";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") {
    const actor = await requireActor(req, res, Permission.IntakeReadAllTickets);
    if (!actor) return;
    try {
      const rules = await listRoutingRules(actor.organizationId);
      return res.status(200).json({ rules });
    } catch (err) {
      console.error("[/api/intake/routing-rules GET] failed:", err);
      return res.status(500).json({ error: "Internal error" });
    }
  }

  if (req.method === "POST") {
    const actor = await requireActor(req, res, Permission.AdminManageUsers);
    if (!actor) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const rule = await createRoutingRule(
        actor.organizationId,
        body,
        { req, res },
      );
      return res.status(201).json({ rule });
    } catch (err) {
      if (err instanceof RoutingRuleValidationError) {
        return res.status(400).json({ error: err.message });
      }
      console.error("[/api/intake/routing-rules POST] failed:", err);
      return res.status(500).json({ error: "Internal error" });
    }
  }

  res.setHeader("Allow", "GET,POST");
  return res.status(405).json({ error: "Method not allowed" });
}
