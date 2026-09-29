/**
 * POST /api/one-legal/draft — generate an editable draft for the canvas (C1).
 *
 * Produces a Markdown draft (memo, email, clause, summary, outline, …) the user
 * then edits in place in ONE Legal's artifact canvas. This does NOT persist and
 * does NOT create a formal Contract — that governed path stays the contracts.draft
 * tool (propose → approve → act). This is the fast, editable-draft surface.
 *
 * Degrades to a deterministic skeleton when Claude is unavailable, so the canvas
 * always opens with something to edit. Server-side; gated intake:create_ticket.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { assertAndAudit } from "../../../lib/authz";
import { callClaude } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";

function titleFrom(instruction: string): string {
  const words = instruction.replace(/^(draft|write|compose|prepare|create|make)\s+(a|an|the)?\s*/i, "").replace(/\s+/g, " ").trim();
  const t = words.split(" ").slice(0, 8).join(" ");
  return (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, 80) || "Untitled draft";
}

function skeleton(instruction: string, title: string): string {
  return `# ${title}\n\n_Draft generated from: "${instruction}". AI drafting is offline — this is a starting skeleton to edit._\n\n## Purpose\n\n- \n\n## Key points\n\n- \n- \n\n## Details\n\n\n\n## Next steps\n\n- \n\n---\n_Not legal advice — a qualified lawyer should review before use._`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    await assertAndAudit(user, Permission.IntakeCreateTicket, { route: "one-legal.draft" });
    const instruction = String((req.body || {}).instruction || (req.body || {}).text || "").trim();
    if (instruction.length < 3) return res.status(400).json({ ok: false, error: "Describe what to draft." });
    const title = titleFrom(instruction);

    let content = "";
    let degraded = false;
    try {
      ensureServerClaudeTransport();
      const system =
        "You are AEGIS, drafting for a corporate legal-operations team. Produce a clean, well-structured Markdown draft that " +
        "the user will edit — a memo, email, clause, summary, outline, or similar as the instruction implies. Use clear headings " +
        "and lists. Keep placeholders like [Party], [Date], [Amount] where specifics are unknown — never invent facts, names, or " +
        "numbers. End with a one-line note that a qualified lawyer should review. Output ONLY the Markdown, no preamble.";
      content = ((await callClaude(instruction, { system, maxTokens: 1200, timeout: 25000 })) || "").trim();
      if (!content) throw new Error("empty");
    } catch {
      degraded = true;
      content = skeleton(instruction, title);
    }

    return res.status(200).json({ ok: true, title, content, degraded });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
