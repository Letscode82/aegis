/**
 * /api/privacy/dsar/[id]/deliver
 *   GET  — assemble the response package (preview). privacy:dsar:read.
 *   POST — deliver + close the request. Body { channel? }. privacy:dsar:fulfill.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { assembleResponsePackage, deliverDsar, DsarDeliveryBlockedError } from "@aegis/privacy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const id = String(req.query.id || "");
  try {
    if (req.method === "GET") {
      assertUserCanDo(user, Permission.PrivacyDsarRead);
      const pkg = await assembleResponsePackage(user.organizationId, id);
      return res.status(200).json({ ok: true, package: pkg });
    }
    if (req.method === "POST") {
      assertUserCanDo(user, Permission.PrivacyDsarFulfill);
      const result = await deliverDsar(user.organizationId, id, { channel: req.body?.channel }, { id: user.id, type: "USER" });
      return res.status(200).json({ ok: true, ...result });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    if (err instanceof DsarDeliveryBlockedError) return res.status(409).json({ ok: false, error: err.message, code: "DELIVERY_BLOCKED" });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
