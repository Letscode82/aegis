/**
 * POST /api/admin/jobs/contract-digest
 *
 * Computes the org's contract digest and records a chain-sealed
 * `contract.digest.generated` audit row. Real email/Teams delivery is a
 * separate surface — `deliveryStubbed:true` marks the seam (same documented
 * stub pattern as notice sending). Same pg-boss-ready trigger shape as the
 * obligation-breach and renewal-notice sweeps: manual admin button or external
 * scheduler today; `pg-boss.schedule()` calls `getContractDigest(orgId)` +
 * a delivery step when the worker + mailer ship.
 *
 * Gated by `admin:manage_users`.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { logAudit } from "@aegis/db";
import { getContractDigest } from "@aegis/contracts";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AdminManageUsers);
  if (!actor) return;
  try {
    const digest = await getContractDigest(actor.organizationId);
    await logAudit({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: "USER",
      action: "contract.digest.generated",
      resourceType: "Organization",
      resourceId: actor.organizationId,
      afterJson: { counts: digest.counts, summaryLine: digest.summaryLine, actionableTotal: digest.actionableTotal } as never,
      metadata: { source: "contracts", deliveryStubbed: true } as never,
    });
    return res.status(200).json({ ...digest, deliveryStubbed: true });
  } catch (err) {
    console.error("[jobs/contract-digest] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
