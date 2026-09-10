/**
 * POST /api/trademark/screen   { mark: string, classes?: number[] }
 *
 * Real trademark knock-out screening for the Trademark tab — the same engine
 * behind the Trademark Clearance intake agent. Returns
 * status "conflict" | "clear" | "unavailable" against the TrademarkMark index
 * using deterministic phonetic + visual + NICE-class similarity. "unavailable"
 * (empty / stale data) is the safe default — never a false all-clear. This is
 * a preliminary screen, not a formal clearance.
 *
 * Gated on intake:read_all_tickets.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { screenTrademark } from "@aegis/intake/trademark";
import { requireActor } from "../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
  }
  const actor = await requireActor(req, res, Permission.IntakeReadAllTickets);
  if (!actor) return;

  const body = (req.body ?? {}) as { mark?: unknown; classes?: unknown };
  const mark = typeof body.mark === "string" ? body.mark : "";
  const classes = Array.isArray(body.classes)
    ? body.classes.map((c) => Number(c)).filter((n) => Number.isFinite(n))
    : typeof body.classes === "string"
      ? body.classes.split(",").map((c) => parseInt(c.trim(), 10)).filter((n) => Number.isFinite(n))
      : [];
  if (!mark.trim()) {
    return res.status(400).json({ ok: false, error: { code: "MISSING_MARK", message: "A word mark is required to screen." } });
  }
  try {
    const result = await screenTrademark(mark, classes);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(200).json({
      ok: true,
      status: "unavailable",
      conflicts: [],
      screened: 0,
      listAsOf: null,
      sources: [],
      note: `Trademark screening errored (${String((err as Error)?.message ?? err)}) — a formal registry search is required.`,
    });
  }
}
