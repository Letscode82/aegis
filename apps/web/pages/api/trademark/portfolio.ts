/**
 * GET /api/trademark/portfolio[?search=&status=LIVE&limit=200]
 *
 * Trademark portfolio + registry health for the Trademark tab. Lists marks
 * from the TrademarkMark index (the same table the knock-out screen matches
 * against) plus which registries are wired and cache freshness.
 *
 * Read-gated on intake:read_all_tickets (trademark clearance is intake-
 * adjacent; a dedicated trademark permission lands with role-gating).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { listTrademarkMarks, getRegistryStatus } from "@aegis/intake/trademark";
import { requireActor } from "../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
  }
  const actor = await requireActor(req, res, Permission.IntakeReadAllTickets);
  if (!actor) return;

  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);
  const num = (v: unknown) => (typeof v === "string" && !Number.isNaN(Number(v)) ? Number(v) : undefined);
  try {
    const [portfolio, registry] = await Promise.all([
      listTrademarkMarks({ search: str(req.query.search), status: str(req.query.status), limit: num(req.query.limit) }),
      getRegistryStatus(),
    ]);
    return res.status(200).json({ ok: true, ...portfolio, registry });
  } catch (err) {
    return res.status(500).json({ ok: false, error: { code: "PORTFOLIO_FAILED", message: String((err as Error)?.message ?? err) } });
  }
}
