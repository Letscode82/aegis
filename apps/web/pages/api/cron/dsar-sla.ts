/**
 * GET|POST /api/cron/dsar-sla — daily DSAR statutory-deadline breach sweep
 * across every organisation. Authenticated by CRON_SECRET (see lib/cron-auth).
 * Idempotent; Vercel Cron calls it on the schedule in vercel.json.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { runAllOrgDsarSlaSweeps } from "@aegis/privacy";
import { checkCronAuth } from "../../../lib/cron-auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = checkCronAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
  try {
    const result = await runAllOrgDsarSlaSweeps();
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/dsar-sla] failed:", err);
    return res.status(500).json({ ok: false, error: String((err as Error).message || err) });
  }
}
