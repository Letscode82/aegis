import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { verifyAuditChain } from "@aegis/db";
import { requireActor } from "../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AuditReadAll);
  if (!actor) return;
  try {
    const result = await verifyAuditChain(actor.organizationId);
    res.status(200).json({
      ...result,
      breaks: result.breaks.map((b) => ({
        ...b,
        chainPosition: b.chainPosition.toString(),
      })),
      verifiedAt: result.verifiedAt.toISOString(),
    });
  } catch (err) {
    console.error("[/api/audit-log/verify] failed:", err);
    res.status(500).json({ error: String(err) });
  }
}
