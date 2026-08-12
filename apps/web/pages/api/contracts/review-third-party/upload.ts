/**
 * POST /api/contracts/review-third-party/upload — upload a third-party contract
 * FILE (PDF / DOCX / TXT), extract its text, and start the internal-legal review
 * (or ingest an already-executed one). Body JSON:
 *   { filename, mimeType?, dataBase64, title, type?, counterpartyId?,
 *     governingLaw?, startReview? }
 * So business users don't have to copy-paste a large document. Gated
 * contracts:create; chain-sealed by the review service.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { reviewThirdPartyContract } from "@aegis/contracts";
import { extractDocumentText, UnsupportedDocumentFormatError, DocumentParseError } from "@aegis/documents";

// Raise the body limit — a base64-encoded document is larger than the default 1mb.
export const config = { api: { bodyParser: { sizeLimit: "30mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const b = req.body ?? {};
  const filename = String(b.filename ?? "");
  const dataBase64 = typeof b.dataBase64 === "string" ? b.dataBase64 : "";
  if (!filename || !dataBase64) return res.status(400).json({ ok: false, error: "filename and file data are required" });

  try {
    assertUserCanDo(user, Permission.ContractsCreate);

    // Decode + extract text from the uploaded file.
    let text: string;
    try {
      const buf = Buffer.from(dataBase64, "base64");
      const extracted = extractDocumentText(filename, b.mimeType, buf);
      text = extracted.text;
    } catch (e) {
      if (e instanceof UnsupportedDocumentFormatError || e instanceof DocumentParseError) {
        return res.status(400).json({ ok: false, error: e.message });
      }
      throw e;
    }
    if (!text.trim()) return res.status(400).json({ ok: false, error: "No readable text found in the file." });

    const result = await reviewThirdPartyContract(
      user.organizationId,
      {
        title: String(b.title ?? "").trim() || filename.replace(/\.[^.]+$/, ""),
        type: String(b.type ?? "Third-party"),
        counterpartyId: b.counterpartyId || null,
        text,
        governingLaw: b.governingLaw || null,
      },
      { id: user.id, type: "USER" },
    );
    return res.status(200).json({ ok: true, ...result, extractedChars: text.length });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
