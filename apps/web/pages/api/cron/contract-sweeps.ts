/**
 * GET|POST /api/cron/contract-sweeps
 *
 * Daily scheduled worker: arms renewal-notice obligations and flips overdue
 * obligations to BREACHED across EVERY organisation. Authenticated by the
 * shared CRON_SECRET (see lib/cron-auth) — no Auth0 session. Idempotent, so a
 * missed or doubled run is safe. Vercel Cron calls this on the schedule in
 * vercel.json; any external scheduler can call it with the bearer secret.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { runAllOrgContractSweeps } from "@aegis/contracts";
import { checkCronAuth } from "../../../lib/cron-auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = checkCronAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  try {
    const result = await runAllOrgContractSweeps();
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/contract-sweeps] failed:", err);
    return res.status(500).json({ ok: false, error: String((err as Error).message || err) });
  }
}
