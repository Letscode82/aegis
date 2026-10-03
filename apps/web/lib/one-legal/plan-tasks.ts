/**
 * ONE Legal task planning (OL-1 core, shared) — decompose a legal request into
 * an ordered list of independently-actionable tasks.
 *
 * Extracted so both the synchronous `/api/one-legal/plan` route and the
 * streaming `/api/one-legal/run` route plan identically: Claude decomposition
 * via the server transport (key stays server-side), DEGRADING to a
 * deterministic splitter when the model is unavailable or malformed — so it
 * always returns at least one task and never blocks the console.
 *
 * No mutation, no schema. The caller attaches a governed tool proposal
 * (`toolProposalFor`) to each task and gates execution behind human Approve.
 */
import { callClaudeJSON } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";

export type Task = { title: string; request: string };

export const MAX_TASKS = 5;

export function titleFor(s: string): string {
  const words = s.replace(/\s+/g, " ").trim().split(" ").slice(0, 6).join(" ");
  return words.length > 48 ? words.slice(0, 48) + "…" : words;
}

// Deterministic fallback: split only on EXPLICIT structure (lists, newlines,
// clear joiners) so we never over-split a single request like
// "harassment and discrimination". Returns 1 task when not clearly compound.
export function deterministicSplit(text: string): Task[] {
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

/**
 * Plan a request into tasks. Tries Claude decomposition first, degrades to the
 * deterministic splitter. Always returns at least one task.
 */
export async function planTasks(text: string): Promise<Task[]> {
  let tasks: Task[] | null = null;
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
  return tasks ?? deterministicSplit(text);
}
