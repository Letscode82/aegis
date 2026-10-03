/**
 * GET|POST /api/cron/obligation-reminders
 *
 * Daily scheduled worker (C-9): reminds owners of contract obligations coming
 * due within the look-ahead window, across EVERY organisation, with a
 * chain-sealed `contract.obligation.reminder` row per obligation. The
 * proactive half of the obligation engine — paired with the overdue → BREACHED
 * sweep in /api/cron/contract-sweeps. Authenticated by the shared CRON_SECRET
 * (see lib/cron-auth) — no Auth0 session. Idempotent per due date, so a missed
 * or doubled run is safe. The F-6 worker runtime schedules this directly;
 * Vercel Cron / any external pinger is the fallback.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { runAllOrgObligationReminders } from "@aegis/contracts";
import { checkCronAuth } from "../../../lib/cron-auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = checkCronAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  try {
    const result = await runAllOrgObligationReminders();
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/obligation-reminders] failed:", err);
    return res.status(500).json({ ok: false, error: String((err as Error).message || err) });
  }
}
