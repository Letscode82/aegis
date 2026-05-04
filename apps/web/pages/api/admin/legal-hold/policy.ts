/**
 * GET  /api/admin/legal-hold/policy — read the org-wide hold policy.
 * PUT  /api/admin/legal-hold/policy — upsert the policy.
 *
 * Body for PUT (partial; missing fields keep current value):
 *   {
 *     attestationCadenceDays?: number,
 *     reminderLeadTimeDays?: number,
 *     escalationChain?: Array<{level, afterDays, notifyRoleNames}>,
 *     jurisdictionPolicies?: Record<string, {cadenceDays, mandatoryLanguageMd?}>,
 *   }
 *
 * Gated by `admin:manage_users` for now — the hold-policy editor is
 * a tier-1 admin surface; a dedicated `admin:legal_hold:policy_manage`
 * permission can split out later if customers want a finer
 * delegation. Today the org admin role already grants both.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  getOrgHoldPolicy,
  updateOrgHoldPolicy,
  type ResolvedHoldPolicy,
} from "@aegis/matter";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") {
    const actor = await requireActor(req, res, Permission.AdminManageUsers);
    if (!actor) return;
    const policy = await getOrgHoldPolicy(actor.organizationId);
    return res.status(200).json(policy);
  }

  if (req.method === "PUT") {
    const actor = await requireActor(req, res, Permission.AdminManageUsers);
    if (!actor) return;
    const body = (req.body ?? {}) as Partial<ResolvedHoldPolicy>;
    try {
      const merged = await updateOrgHoldPolicy(actor.organizationId, body);
      return res.status(200).json(merged);
    } catch (err) {
      console.error("[admin/legal-hold/policy PUT] failed:", err);
      return res.status(500).json({ error: String(err) });
    }
  }

  res.setHeader("Allow", "GET,PUT");
  return res.status(405).json({ error: "Method not allowed" });
}
