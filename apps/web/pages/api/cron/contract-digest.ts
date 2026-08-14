/**
 * GET|POST /api/cron/contract-digest
 *
 * Weekly scheduled worker: computes each organisation's actionable contract
 * digest and emails it to that org's leadership (admin / gc / legal_ops users,
 * plus any CONTRACT_DIGEST_TO override) through the shared @aegis/email mailer.
 * Authenticated by CRON_SECRET (see lib/cron-auth) — no Auth0 session. The
 * digest is always recorded on the audit ledger; the email is best-effort and
 * degrades to a logged no-op when no mail provider is configured.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { runAllOrgContractDigests } from "@aegis/contracts";
import { checkCronAuth } from "../../../lib/cron-auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = checkCronAuth(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  try {
    const result = await runAllOrgContractDigests();
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/contract-digest] failed:", err);
    return res.status(500).json({ ok: false, error: String((err as Error).message || err) });
  }
}
