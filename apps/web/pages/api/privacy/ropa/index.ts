/**
 * GET  /api/privacy/ropa — list records of processing activities
 * POST /api/privacy/ropa — create one
 * Gated privacy:dpia:read. Chain-sealed in the service.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { listRopa, createRopa } from "@aegis/privacy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  try {
    assertUserCanDo(user, Permission.PrivacyDpiaRead);
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, items: await listRopa(user.organizationId) });
    }
    if (req.method === "POST") {
      const b = req.body || {};
      const created = await createRopa(user.organizationId, {
        name: String(b.name || ""), lawfulBasis: b.lawfulBasis, retentionPeriodDays: b.retentionPeriodDays,
        dataTypes: b.dataTypes, dataSubjectCategories: b.dataSubjectCategories, systems: b.systems, transferredCountries: b.transferredCountries,
      }, user.id);
      return res.status(200).json({ ok: true, activity: created });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
