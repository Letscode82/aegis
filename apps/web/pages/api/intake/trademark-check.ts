/**
 * GET /api/intake/trademark-check?mark=<mark>&classes=9,42
 *
 * Real trademark knock-out screening behind the Trademark Clearance agent.
 * Returns status "conflict" | "clear" | "unavailable" against the
 * TrademarkMark table using deterministic phonetic + visual + class
 * similarity. "unavailable" (empty / stale data) is the safe default —
 * never a false all-clear. A preliminary screen, not a formal clearance.
 *
 * Read-gated on intake:read_all_tickets.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { screenTrademark } from "@aegis/intake/trademark";
import { requireActor } from "../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.IntakeReadAllTickets);
  if (!actor) return;
  const mark = typeof req.query.mark === "string" ? req.query.mark : "";
  const classes = typeof req.query.classes === "string"
    ? req.query.classes.split(",").map((c) => parseInt(c.trim(), 10)).filter((n) => Number.isFinite(n))
    : [];
  try {
    const result = await screenTrademark(mark, classes);
    return res.status(200).json(result);
  } catch (err) {
    console.error("[/api/intake/trademark-check] failed:", err);
    return res.status(200).json({
      status: "unavailable",
      conflicts: [],
      screened: 0,
      listAsOf: null,
      note: "Trademark screening errored — a formal registry search is required.",
    });
  }
}
