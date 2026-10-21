/**
 * /api/admin/contracts/routing-rules/[id]
 *
 *   PUT    → patch a rule (any field; null clears, undefined preserves)
 *   DELETE → remove a rule
 *
 * Both write-gated on admin:manage_users — the same governance gate as create.
 * Every mutation is chain-sealed by the service (contract.routing_rule.*).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  updateContractRoutingRule,
  deleteContractRoutingRule,
  ContractRoutingRuleNotFoundError,
  ContractRoutingRuleValidationError,
} from "@aegis/contracts";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = String(req.query.id || "");
  if (!id) return res.status(400).json({ error: "Missing rule id" });

  if (req.method === "PUT") {
    const actor = await requireActor(req, res, Permission.AdminManageUsers);
    if (!actor) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const rule = await updateContractRoutingRule(actor.organizationId, id, body, { id: actor.id, type: "USER" });
      return res.status(200).json({ rule });
    } catch (err) {
      if (err instanceof ContractRoutingRuleNotFoundError) return res.status(404).json({ error: err.message });
      if (err instanceof ContractRoutingRuleValidationError) return res.status(400).json({ error: err.message });
      console.error("[/api/admin/contracts/routing-rules/[id] PUT] failed:", err);
      return res.status(500).json({ error: "Internal error" });
    }
  }

  if (req.method === "DELETE") {
    const actor = await requireActor(req, res, Permission.AdminManageUsers);
    if (!actor) return;
    try {
      await deleteContractRoutingRule(actor.organizationId, id, { id: actor.id, type: "USER" });
      return res.status(204).end();
    } catch (err) {
      if (err instanceof ContractRoutingRuleNotFoundError) return res.status(404).json({ error: err.message });
      console.error("[/api/admin/contracts/routing-rules/[id] DELETE] failed:", err);
      return res.status(500).json({ error: "Internal error" });
    }
  }

  res.setHeader("Allow", "PUT,DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
