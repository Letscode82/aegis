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
import { getContractPlaybookText } from "@aegis/contracts";

// A draft that is itself a contract/NDA — those are seeded from the org's
// own Contracts Playbook (Phase 7, refinement 1, extending #558) so a
// quick-draft contract reflects the org's standard positions, not generic
// boilerplate. Memos / letters / emails draft as before.
const CONTRACT_DRAFT_RE =
  /\b(nda|non-?disclosure|confidential(?:ity)?\s+(?:agreement|undertaking)|msa|sow|dpa|contract|agreement|licen[cs]e|master\s+services|statement\s+of\s+work|data\s+processing|terms\s+of\s+service|tos)\b/i;

function titleFrom(instruction: string): string {
  const words = instruction.replace(/^(draft|write|compose|prepare|create|make)\s+(a|an|the)?\s*/i, "").replace(/\s+/g, " ").trim();
  const t = words.split(" ").slice(0, 8).join(" ");
  return (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, 80) || "Untitled draft";
}

function skeleton(instruction: string, title: string): string {
  return `# ${title}\n\n_Draft generated from: "${instruction}". AI drafting is offline — this is a starting skeleton to edit._\n\n## Purpose\n\n- \n\n## Key points\n\n- \n- \n\n## Details\n\n\n\n## Next steps\n\n- \n\n---\n_Not legal advice — a qualified lawyer should review before use._`;
}

// C-11 — multilingual drafting. The target language is picked from a fixed
// allowlist (never free text) so it can only steer the output language, not
// inject arbitrary instructions into the prompt. English is the default and
// adds no instruction.
const DRAFT_LANGUAGES = [
  "English", "Spanish", "French", "German", "Portuguese", "Italian", "Dutch",
  "Hindi", "Japanese", "Chinese (Simplified)", "Korean", "Arabic",
] as const;

function resolveLanguage(input: unknown): string {
  return typeof input === "string" && (DRAFT_LANGUAGES as readonly string[]).includes(input)
    ? input
    : "English";
}

// Give the model call room past Vercel's short default function limit (same
// reason as the skill-review route; the callClaude timeout still aborts first).
export const config = { maxDuration: 60 };

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
    const language = resolveLanguage((req.body || {}).language);

    // Refinement 1 (Phase 7): a quick-draft contract/NDA is seeded from the
    // org's OWN editable Contracts Playbook (the `contract-clauses` knowledge
    // pack — reuses #558's getContractPlaybookText) so the draft opens on the
    // org's standard positions instead of generic boilerplate. Empty playbook
    // or a non-contract draft → the generic drafting prompt, unchanged.
    // Best-effort: a lookup failure never blocks the draft.
    let playbookText = "";
    if (CONTRACT_DRAFT_RE.test(instruction)) {
      try {
        playbookText = await getContractPlaybookText(user.organizationId);
      } catch (e) {
        console.error("[one-legal:draft] org playbook lookup failed:", (e as Error)?.message || e);
      }
    }
    const playbookApplied = playbookText.trim().length > 0;

    let content = "";
    let degraded = false;
    try {
      ensureServerClaudeTransport();
      const system =
        "You are OneLegal, drafting for a corporate legal-operations team. Produce a clean, well-structured Markdown draft that " +
        "the user will edit — a memo, email, clause, summary, outline, contract, or similar as the instruction implies. Use clear headings " +
        "and lists. Keep placeholders like [Party], [Date], [Amount] where specifics are unknown — never invent facts, names, or " +
        "numbers. End with a one-line note that a qualified lawyer should review. Output ONLY the Markdown, no preamble." +
        (playbookApplied
          ? "\n\nThe following is your organization's AUTHORITATIVE Contracts Playbook. When the draft is a contract or NDA, draft every" +
            " applicable clause to these standard positions (fall back to the fallback language only where noted), and do not substitute" +
            " generic market boilerplate for a position the playbook sets.\n\n" +
            playbookText
          : "") +
        (language !== "English"
          ? ` Write the entire draft — headings, body, and the closing review note — in ${language}. Keep the bracketed placeholders in their original form.`
          : "");
      content = ((await callClaude(instruction, { system, maxTokens: 1200, timeout: 25000 })) || "").trim();
      if (!content) throw new Error("empty");
    } catch {
      degraded = true;
      content = skeleton(instruction, title);
    }

    return res.status(200).json({ ok: true, title, content, degraded, language, playbookApplied });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
