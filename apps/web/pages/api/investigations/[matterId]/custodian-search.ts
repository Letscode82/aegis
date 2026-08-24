/**
 * GET /api/investigations/[matterId]/custodian-search?q=priya — search the M365
 * directory for custodians to add to an investigation (INV-2). Uses the Graph
 * directory lookup (real tenant users when connected; a representative roster in
 * mock mode), deduped by email so the picker is clean. matter:read_all.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { searchM365DirectoryUsers } from "@aegis/matter";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }
  const matterId = req.query.matterId;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (typeof matterId !== "string") return res.status(400).json({ error: "Invalid matterId" });
  const actor = await requireActor(req, res, Permission.MatterReadAll);
  if (!actor) return;
  if (q.length < 2) return res.status(200).json({ ok: true, users: [], simulated: false });
  try {
    const { users, simulated } = await searchM365DirectoryUsers(actor.organizationId, { query: q, matterId });
    // Dedup by email (case-insensitive); keep the first hit per address.
    const seen = new Set<string>();
    const deduped = [];
    for (const u of users) {
      const key = (u.email || u.id || "").toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(u);
    }
    return res.status(200).json({ ok: true, users: deduped.slice(0, 15), simulated });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
