/**
 * GET /api/admin/m365/delegated-connect/poll?sessionId=...
 *
 * Polls the in-flight Device Code session. Returns the current
 * state machine value:
 *
 *   pending   → user hasn't entered the code yet
 *   connected → tokens stored; client should refresh /admin/m365
 *   expired   → device code TTL elapsed
 *   error     → other failure (Microsoft refused, network, etc.)
 *
 * The endpoint is safe to poll every 2-3 seconds; sessions are
 * in-process state, no DB hit.
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
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AdminM365Manage);
  if (!actor) return;
  const sessionId = req.query.sessionId;
  if (typeof sessionId !== "string") {
    return res.status(400).json({ error: "sessionId required" });
  }
  const result = pollDeviceCodeFlow(sessionId);
  return res.status(200).json(result);
}
