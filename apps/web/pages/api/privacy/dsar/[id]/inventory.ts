/**
 * /api/privacy/dsar/[id]/inventory — personal-data location checklist.
 *   GET  — list locations. privacy:dsar:read.
 *   POST — add a location, or seed from ROPA (body { seed:true }). fulfill.
 *   PUT  — update a location (body { locationId, found?, redactionsRequired?, retrieved? }). fulfill.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { listDataLocations, addDataLocation, updateDataLocation, seedInventoryFromRopa } from "@aegis/privacy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const id = String(req.query.id || "");
  const actor = { id: user.id, type: "USER" as const };
  try {
    if (req.method === "GET") {
      assertUserCanDo(user, Permission.PrivacyDsarRead);
      return res.status(200).json({ ok: true, locations: await listDataLocations(user.organizationId, id) });
    }
    if (req.method === "POST") {
      assertUserCanDo(user, Permission.PrivacyDsarFulfill);
      if (req.body?.seed) {
        const result = await seedInventoryFromRopa(user.organizationId, id, actor);
        return res.status(200).json({ ok: true, seeded: result, locations: await listDataLocations(user.organizationId, id) });
      }
      const location = await addDataLocation(user.organizationId, id, { system: req.body?.system, dataType: req.body?.dataType, found: req.body?.found, redactionsRequired: req.body?.redactionsRequired }, actor);
      return res.status(200).json({ ok: true, location });
    }
    if (req.method === "PUT") {
      assertUserCanDo(user, Permission.PrivacyDsarFulfill);
      const location = await updateDataLocation(user.organizationId, id, String(req.body?.locationId || ""), { found: req.body?.found, redactionsRequired: req.body?.redactionsRequired, retrieved: req.body?.retrieved }, actor);
      return res.status(200).json({ ok: true, location });
    }
    res.setHeader("Allow", "GET, POST, PUT");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
