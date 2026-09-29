/**
 * POST /api/one-legal/artifact — save an edited canvas draft (C1).
 *
 * Persists the user's edited Markdown as a first-class Document (ownerType
 * CONSOLE, same category as B2 uploads — created in the console, not yet
 * attached to a matter), indexes it for semantic retrieval, and writes a
 * chain-sealed audit row. The saved artifact then joins the "one brain" and is
 * citable by later questions.
 *
 * Server-side; gated intake:create_ticket.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { assertAndAudit } from "../../../lib/authz";
import { prisma, logAudit, DocumentOwnerType } from "@aegis/db";
import { indexResource } from "@aegis/search";

export const config = { api: { bodyParser: { sizeLimit: "2mb" } } };
const MAX_CHARS = 200000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    await assertAndAudit(user, Permission.IntakeCreateTicket, { route: "one-legal.artifact" });
    const body = (req.body || {}) as Record<string, unknown>;
    const title = (typeof body.title === "string" ? body.title : "").trim().slice(0, 200) || "Untitled draft";
    const content = (typeof body.content === "string" ? body.content : "").slice(0, MAX_CHARS);
    const sessionId = (typeof body.sessionId === "string" ? body.sessionId : "").trim();
    if (!content.trim()) return res.status(400).json({ ok: false, error: "The draft is empty." });

    const doc = await prisma.document.create({
      data: {
        organizationId: user.organizationId,
        name: title,
        mimeType: "text/markdown",
        sizeBytes: content.length,
        storageUrl: `inline://console-artifact/${sessionId || user.id}/${Date.now().toString(36)}`,
        ownerType: DocumentOwnerType.CONSOLE,
        ownerId: sessionId || user.id,
        uploadedBy: user.id,
        extractedText: content,
      },
      select: { id: true },
    });

    await logAudit({
      organizationId: user.organizationId,
      actorId: user.id,
      actorType: "USER",
      action: "one_legal.artifact.saved",
      resourceType: "Document",
      resourceId: doc.id,
      afterJson: { title, charCount: content.length, sessionId: sessionId || null },
      metadata: { source: "one-legal-canvas" },
    });

    try {
      await indexResource({ organizationId: user.organizationId, ownerType: "DOCUMENT", ownerId: doc.id, documentId: doc.id, text: `${title}\n\n${content}` });
    } catch { /* indexing is best-effort */ }

    return res.status(201).json({ ok: true, documentId: doc.id, title });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
