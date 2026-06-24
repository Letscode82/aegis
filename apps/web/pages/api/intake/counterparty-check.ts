/**
 * GET /api/intake/counterparty-check?name=<counterparty>
 *
 * Real relationship lookup behind the NDA agent. Returns whether a
 * counterparty with this name already exists in the org (and how many
 * matters are on file) so the agent can suggest reusing an existing NDA
 * instead of drafting a new one. Replaces the hardcoded mock.
 *
 * Read-gated on intake:read_all_tickets — the same scope the Cockpit
 * operator already holds.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { lookupCounterpartyRelationship } from "@aegis/intake/counterparty";
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
  try {
    const result = await lookupCounterpartyRelationship(
      actor.organizationId,
      name,
    );
    return res.status(200).json(result);
  } catch (err) {
    console.error("[/api/intake/counterparty-check] failed:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
