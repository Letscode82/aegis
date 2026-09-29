/**
 * POST /api/one-legal/upload — attach a document to the ONE Legal console (B2).
 *
 * "Upload & analyze": the user drops a file into the console; the server
 * extracts its text (@aegis/documents), persists it as a first-class Document
 * (ownerType CONSOLE — dropped in for analysis, not yet attached to a matter),
 * indexes it for semantic retrieval (@aegis/search, best-effort), and returns
 * the extracted text so the console can immediately analyze or ask over it.
 * Because it's a real Document, it also joins the "one brain" and becomes
 * citable by the K1.3 cited-Q&A path.
 *
 * Body (JSON): { filename, mimeType?, contentBase64, sessionId? }
 * Server-side only; gated intake:create_ticket (same as the other console routes).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { assertAndAudit } from "../../../lib/authz";
import { prisma, logAudit, DocumentOwnerType } from "@aegis/db";
import {
  extractDocumentText,
  UnsupportedDocumentFormatError,
  DocumentParseError,
} from "@aegis/documents";
import { indexResource } from "@aegis/search";

// File arrives as base64 in a JSON body (~33% larger than raw). Same ceiling as
// the intake inline upload: ~3 MB decoded fits under the 4.5 MB serverless cap.
export const config = { api: { bodyParser: { sizeLimit: "5mb" } } };
const MAX_BYTES = 3 * 1024 * 1024;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    await assertAndAudit(user, Permission.IntakeCreateTicket, { route: "one-legal.upload" });
    const body = (req.body || {}) as Record<string, unknown>;
    const filename = (typeof body.filename === "string" ? body.filename : "").trim() || "document";
    const contentBase64 = typeof body.contentBase64 === "string" ? body.contentBase64 : "";
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : undefined;
    const sessionId = (typeof body.sessionId === "string" ? body.sessionId : "").trim();
    if (!contentBase64) return res.status(400).json({ ok: false, error: "No file content provided." });

    const buf = Buffer.from(contentBase64, "base64");
    if (buf.length === 0) return res.status(400).json({ ok: false, error: "Uploaded file is empty." });
    if (buf.length > MAX_BYTES) return res.status(400).json({ ok: false, error: "File is too large (max 3 MB). Use a smaller export or paste the text." });

    // Throws UnsupportedDocumentFormatError / DocumentParseError on bad input.
    const { format, text } = extractDocumentText(filename, mimeType, buf);

    const resolvedMime =
      mimeType ||
      (format === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : format === "pdf"
          ? "application/pdf"
          : "text/plain");

    const doc = await prisma.document.create({
      data: {
        organizationId: user.organizationId,
        name: filename,
        mimeType: resolvedMime,
        sizeBytes: buf.length,
        storageUrl: `inline://console/${sessionId || user.id}/${encodeURIComponent(filename)}`,
        ownerType: DocumentOwnerType.CONSOLE,
        ownerId: sessionId || user.id,
        uploadedBy: user.id,
        extractedText: text,
      },
      select: { id: true },
    });

    await logAudit({
      organizationId: user.organizationId,
      actorId: user.id,
      actorType: "USER",
      action: "one_legal.document.uploaded",
      resourceType: "Document",
      resourceId: doc.id,
      afterJson: { name: filename, format, sizeBytes: buf.length, charCount: text.length, sessionId: sessionId || null },
      metadata: { source: "one-legal-upload" },
    });

    // Best-effort semantic indexing (no-op without pgvector + a provider).
    try {
      await indexResource({ organizationId: user.organizationId, ownerType: "DOCUMENT", ownerId: doc.id, documentId: doc.id, text });
    } catch { /* indexing is best-effort */ }

    return res.status(201).json({ ok: true, documentId: doc.id, name: filename, format, sizeBytes: buf.length, charCount: text.length });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    if (err instanceof UnsupportedDocumentFormatError || err instanceof DocumentParseError) {
      return res.status(400).json({ ok: false, error: (err as Error).message });
    }
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
