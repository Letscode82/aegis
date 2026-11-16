/**
 * GET /api/contracts/[id]/signing-certificate — the Certificate of Completion:
 * court-grade execution evidence (signers, timestamps, IP/UA, terms-hash
 * binding, tamper-evident audit-chain anchors), assembled deterministically.
 * Gated contracts:read_all. Read-only.
 *
 *   ?format=text → text/plain download (the printable certificate).
 *   default      → JSON { ok, certificate, text }.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getSigningCertificateService, renderSigningCertificateText } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");

  try {
    assertUserCanDo(user, Permission.ContractsReadAll);
    const certificate = await getSigningCertificateService(user.organizationId, contractId);
    const text = renderSigningCertificateText(certificate);
    const format = String(Array.isArray(req.query.format) ? req.query.format[0] : req.query.format || "");
    if (format === "text") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="certificate-of-completion-${contractId}.txt"`);
      return res.status(200).send(text);
    }
    return res.status(200).json({ ok: true, certificate, text });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
