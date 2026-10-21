/**
 * /api/admin/contracts/routing-rules
 *
 *   GET  → list rules (read-gated on contracts:read_all)
 *   POST → create a rule (write-gated on admin:manage_users — same gate as the
 *          intake routing-rules editor, so contract + intake automation share
 *          one governance permission)
 *
 * The configurable layer over PR 3's request-driven ladder selection: an admin
 * maps a contract condition (type / perspective / value range) to the approval
 * ladder to run. Every write is chain-sealed by the service.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  listContractRoutingRules,
  createContractRoutingRule,
  ContractRoutingRuleValidationError,
} from "@aegis/contracts";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const actor = await requireActor(req, res, Permission.ContractsReadAll);
    if (!actor) return;
    try {
      const rules = await listContractRoutingRules(actor.organizationId);
      return res.status(200).json({ rules });
    } catch (err) {
      console.error("[/api/admin/contracts/routing-rules GET] failed:", err);
      return res.status(500).json({ error: "Internal error" });
    }
  }

  if (req.method === "POST") {
    const actor = await requireActor(req, res, Permission.AdminManageUsers);
    if (!actor) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const rule = await createContractRoutingRule(actor.organizationId, body, { id: actor.id, type: "USER" });
      return res.status(201).json({ rule });
    } catch (err) {
      if (err instanceof ContractRoutingRuleValidationError) {
        return res.status(400).json({ error: err.message });
      }
      console.error("[/api/admin/contracts/routing-rules POST] failed:", err);
      return res.status(500).json({ error: "Internal error" });
    }
  }

  res.setHeader("Allow", "GET,POST");
  return res.status(405).json({ error: "Method not allowed" });
}
