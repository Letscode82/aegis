/**
 * GET /api/intake/sanctions-check?name=<vendor>&country=<country>
 *
 * Real sanctions screening behind the Vendor Intake agent. Returns
 * status "clear" | "hit" | "unavailable" against the SanctionsListEntry
 * table + comprehensive-jurisdiction programs. "unavailable" (empty /
 * stale list) is the safe default — never a false all-clear.
 *
 * Read-gated on intake:read_all_tickets.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { screenAgainstSanctions } from "@aegis/intake/sanctions";
import { requireActor } from "../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.IntakeReadAllTickets);
  if (!actor) return;
  const name = typeof req.query.name === "string" ? req.query.name : "";
  const country = typeof req.query.country === "string" ? req.query.country : "";
  try {
    const result = await screenAgainstSanctions(name, country);
    return res.status(200).json(result);
  } catch (err) {
    console.error("[/api/intake/sanctions-check] failed:", err);
    // Fail safe: a screening error is "unavailable", never "clear".
    return res.status(200).json({
      status: "unavailable",
      flags: ["Screening service error."],
      matches: [],
      listAsOf: null,
      note: "Sanctions screening errored — manual screening required.",
    });
  }
}
