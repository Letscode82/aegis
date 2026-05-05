/**
 * GET /api/admin/m365/delegated-connect/poll?sessionId=...
 *
 * Polls a Device Code session. Returns the current state machine
 * value:
 *
 *   pending   → user hasn't entered the code yet
 *   connected → tokens stored; client should refresh /admin/m365
 *   expired   → device code TTL elapsed
 *   error     → other failure (Microsoft refused, network, etc.)
 *
 * Sessions live in `M365DeviceCodeSession` (sub-PR 4c.1 follow-up)
 * so any Lambda instance can service the poll — the long opaque
 * `device_code` is read from the row and passed straight to
 * Microsoft's `/token` endpoint. The first instance to receive an
 * authorized response writes tokens to OrganizationM365Credential
 * in a transaction; concurrent polls observe status='completed' and
 * short-circuit.
 *
 * Permission: admin:m365:manage.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { pollDeviceCodeFlow } from "@aegis/matter";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      ok: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
    });
  }
  const actor = await requireActor(req, res, Permission.AdminM365Manage);
  if (!actor) return;
  const sessionId = req.query.sessionId;
  if (typeof sessionId !== "string") {
    return res.status(400).json({
      ok: false,
      error: {
        code: "MISSING_SESSION_ID",
        message: "sessionId query parameter is required",
      },
    });
  }
  const result = await pollDeviceCodeFlow(sessionId);
  // Poll's response IS the state-machine value; wrap in `ok: true`
  // so the success/failure discrimination follows the same shape as
  // the other admin endpoints. UI consumers read body.status etc.
  // unchanged.
  return res.status(200).json({ ok: true, ...result });
}
