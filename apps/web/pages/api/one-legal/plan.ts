/**
 * POST /api/one-legal/plan — decompose a legal request into tasks (OL-1).
 *
 * ONE Legal's Cowork-style execution window: a compound request
 * ("open a matter and put a hold on the deal team") is split into an ordered
 * list of independently-actionable tasks, each of which the console then
 * runs through the existing governed intake pipeline (classify → route →
 * file → spawn). A simple single request returns one task.
 *
 * Decomposition uses Claude via the server transport (key stays server-side)
 * and DEGRADES to a deterministic splitter when the model is unavailable or
 * the output is malformed — so it always returns at least one task and never
 * blocks the console. No mutation, no schema; gated intake:create_ticket.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { callClaudeJSON } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";
import { toolProposalFor } from "../../../lib/one-legal/tools";

type Task = { title: string; request: string };

const MAX_TASKS = 5;

// Deterministic fallback: split only on EXPLICIT structure (lists, newlines,
// clear joiners) so we never over-split a single request like
// "harassment and discrimination". Returns 1 task when not clearly compound.
function deterministicSplit(text: string): Task[] {
  const t = text.trim();
  const one: Task[] = [{ title: titleFor(t), request: t }];
  const toTasks = (parts: string[]) =>
    parts.map((p) => p.trim()).filter((p) => p.length >= 8).slice(0, MAX_TASKS).map((p) => ({ title: titleFor(p), request: p }));

  // Numbered / bulleted list.
  let parts = t.split(/\n?\s*(?:\d+[.)]|[-*•])\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) { const ts = toTasks(parts); if (ts.length >= 2) return ts; }
  // Multiple non-trivial lines.
  const lines = t.split(/\n+/).map((s) => s.trim()).filter((s) => s.length >= 8);
  if (lines.length >= 2) { const ts = toTasks(lines); if (ts.length >= 2) return ts; }
  // Explicit clause joiners.
  parts = t.split(/\s*(?:;|\band then\b|\bthen\b|,?\s*and also\b|\balso\b|\bplus\b)\s*/i).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2 && parts.length <= MAX_TASKS) { const ts = toTasks(parts); if (ts.length >= 2) return ts; }
  return one;
}

function titleFor(s: string): string {
  const words = s.replace(/\s+/g, " ").trim().split(" ").slice(0, 6).join(" ");
  return words.length > 48 ? words.slice(0, 48) + "…" : words;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    assertUserCanDo(user, Permission.IntakeCreateTicket);
    const text = String((req.body || {}).text || "").trim();
    if (text.length < 3) return res.status(400).json({ ok: false, error: "Describe your request in a few words." });

    let tasks: Task[] | null = null;
    // Try Claude decomposition (server transport; key stays server-side).
    try {
      ensureServerClaudeTransport();
      const system =
        "You decompose an inbound legal request for a corporate legal department's intake into discrete, independently-actionable tasks. " +
        "Return STRICT JSON: {\"tasks\":[{\"title\":\"3-6 word label\",\"request\":\"a self-contained instruction for this one task\"}]}. " +
        "Return exactly ONE task when the request is a single ask (do not invent extra work). " +
        "Split into multiple tasks ONLY when the request clearly contains separate asks (e.g. 'open a matter AND issue a hold', a numbered list). " +
        "Never exceed 5 tasks. Keep each request's wording faithful to the user's intent; do not add facts.";
      const out = (await callClaudeJSON(text, { system, maxTokens: 600, timeout: 12000 })) as { tasks?: Array<{ title?: string; request?: string }> };
      if (out && Array.isArray(out.tasks) && out.tasks.length >= 1) {
        const cleaned = out.tasks
          .map((tk) => ({ title: String(tk.title || "").trim(), request: String(tk.request || "").trim() }))
          .filter((tk) => tk.request.length >= 3)
          .slice(0, MAX_TASKS)
          .map((tk) => ({ title: tk.title || titleFor(tk.request), request: tk.request }));
        if (cleaned.length >= 1) tasks = cleaned;
      }
    } catch {
      // model unavailable / not configured / malformed → deterministic below
    }

    if (!tasks) tasks = deterministicSplit(text);
    // Attach a governed tool proposal to each task where one applies (display
    // only — execution happens via /api/one-legal/act after human Approve).
    const withTools = tasks.map((tk) => ({ ...tk, tool: toolProposalFor(tk.request) }));
    return res.status(200).json({ ok: true, tasks: withTools });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
