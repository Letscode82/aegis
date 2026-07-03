/**
 * GET|PUT /api/intake/notification-prefs — the session user's outbound
 * notification toggles (W3-2). Any authenticated user manages their
 * own; there is no cross-user surface here.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getCurrentUser } from "@aegis/db";
import {
  getNotificationPrefs,
  setNotificationPrefs,
  normalizePrefs,
} from "@aegis/intake/notifications";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const user = await getCurrentUser(req, res);
  if (!user?.id) {
    return res.status(401).json({ ok: false, error: "Not authenticated" });
  }

  if (req.method === "GET") {
    const prefs = await getNotificationPrefs(user.id);
    return res.status(200).json({ ok: true, prefs });
  }

  if (req.method === "PUT") {
    const prefs = await setNotificationPrefs(
      user.id,
      normalizePrefs(req.body?.prefs ?? req.body),
    );
    return res.status(200).json({ ok: true, prefs });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
