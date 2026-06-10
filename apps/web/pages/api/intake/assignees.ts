/**
 * GET /api/intake/assignees — the org's assignable legal-team users
 * for the Cockpit's reassign picker and the Inbox "My Queue" filter.
 *
 * Gated on intake:read_all_tickets (the Cockpit operator's
 * permission) rather than admin:manage_users — attorneys reassigning
 * tickets must not require platform-admin rights.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { listAssignableUsers } from "@aegis/intake/assignees";
import { requireActor } from "../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(
    req,
    res,
    Permission.IntakeReadAllTickets,
  );
  if (!actor) return;
  try {
    const assignees = await listAssignableUsers(actor.organizationId);
    return res.status(200).json({ assignees });
  } catch (err) {
    console.error("[/api/intake/assignees] failed:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
