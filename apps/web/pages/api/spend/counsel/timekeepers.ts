/**
 * POST /api/spend/counsel/timekeepers — manage a firm's timekeeper roster.
 *   { action:"add", vendorId, name|personId, title, defaultRate, blendedRate? }
 *   { action:"update", timekeeperId, title?, defaultRate?, blendedRate? }
 *   { action:"remove", timekeeperId }
 * Chain-sealed; rate increases flagged in audit metadata.
 * Gated spend:approve_invoice.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { addTimekeeper, updateTimekeeper, removeTimekeeper } from "@aegis/spend";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const b = req.body || {};
  const action = b.action;
  try {
    assertUserCanDo(user, Permission.SpendApproveInvoice);
    if (action === "add") {
      if (!b.vendorId) return res.status(400).json({ ok: false, error: "vendorId is required" });
      const result = await addTimekeeper(user.organizationId, String(b.vendorId), {
        personId: b.personId ? String(b.personId) : undefined,
        name: b.name ? String(b.name) : undefined,
        title: String(b.title || ""),
        defaultRate: Number(b.defaultRate),
        blendedRate: b.blendedRate != null ? Number(b.blendedRate) : null,
      }, user.id);
      return res.status(200).json({ ok: true, ...result });
    }
    if (action === "update") {
      if (!b.timekeeperId) return res.status(400).json({ ok: false, error: "timekeeperId is required" });
      await updateTimekeeper(user.organizationId, String(b.timekeeperId), {
        title: b.title != null ? String(b.title) : undefined,
        defaultRate: b.defaultRate != null ? Number(b.defaultRate) : undefined,
        blendedRate: b.blendedRate !== undefined ? (b.blendedRate != null ? Number(b.blendedRate) : null) : undefined,
      }, user.id);
      return res.status(200).json({ ok: true });
    }
    if (action === "remove") {
      if (!b.timekeeperId) return res.status(400).json({ ok: false, error: "timekeeperId is required" });
      await removeTimekeeper(user.organizationId, String(b.timekeeperId), user.id);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ ok: false, error: "action must be add | update | remove" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
