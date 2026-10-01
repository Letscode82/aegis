/**
 * POST /api/one-legal/artifact-docx — export an edited canvas draft as Word (CW-4).
 *
 * Renders the C1 editable draft (title + Markdown) into an attorney-grade .docx
 * the reviewer downloads, edits in Word, and sends back to the business user.
 * Read-only generation — no mutation, no persistence (use /artifact to save the
 * draft to the workspace). Returns the binary .docx as an attachment.
 *
 * Server-side; gated intake:create_ticket (same as the other console routes).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { renderMarkdownDocx, markdownDocxFilename } from "@aegis/documents";

export const config = { api: { bodyParser: { sizeLimit: "2mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    assertUserCanDo(user, Permission.IntakeCreateTicket);
    const body = (req.body || {}) as { title?: string; content?: string };
    const title = String(body.title || "Document").trim().slice(0, 200) || "Document";
    const content = String(body.content || "");
    if (content.trim().length < 1) return res.status(400).json({ ok: false, error: "Nothing to export." });

    const buffer = await renderMarkdownDocx({
      title,
      markdown: content,
      generatedAt: new Date().toISOString(),
      generatedBy: user.name || null,
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${markdownDocxFilename(title)}"`);
    res.setHeader("Content-Length", String(buffer.length));
    return res.status(200).send(buffer);
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
