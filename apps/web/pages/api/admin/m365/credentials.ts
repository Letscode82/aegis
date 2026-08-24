/**
 * POST /api/admin/m365/credentials
 *
 * Upsert this org's app-only Microsoft 365 credentials (tenant id, client id,
 * client secret). The secret is encrypted at rest via `AEGIS_ENCRYPTION_KEY`
 * (AES-256-GCM). This is the "point AEGIS at a client tenant" control — an
 * operator switches domains from the UI instead of editing env vars. After a
 * successful save, the caller re-verifies.
 *
 * Permission gate: admin:m365:manage OR admin:manage_users (same as the other
 * M365 admin routes).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { upsertOrgM365Credentials } from "@aegis/matter";
import { requireActorAny } from "../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActorAny(req, res, [Permission.AdminM365Manage, Permission.AdminManageUsers]);
  if (!actor) return;
  const b = req.body ?? {};
  const tenantId = String(b.tenantId || "").trim();
  const clientId = String(b.clientId || "").trim();
  const clientSecret = String(b.clientSecret || "").trim();
  if (!tenantId || !clientId || !clientSecret) {
    return res.status(400).json({ ok: false, error: "tenantId, clientId, and clientSecret are all required." });
  }
  try {
    await upsertOrgM365Credentials({
      organizationId: actor.organizationId,
      tenantId, clientId, clientSecret,
      graphBaseUrl: typeof b.graphBaseUrl === "string" && b.graphBaseUrl.trim() ? b.graphBaseUrl.trim() : undefined,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    // Most likely AEGIS_ENCRYPTION_KEY missing in production (fail-loud) —
    // surface it so the operator knows to set the key.
    console.error("[/api/admin/m365/credentials] upsert failed:", err);
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
