/**
 * POST /api/matter/[id]/ask — the scoped workspace assistant (WS-4).
 *
 * Answers a question scoped to one matter: assembles the matter context and
 * routes it through @aegis/ai (server transport). Degrades gracefully to a
 * helpful message when ANTHROPIC_API_KEY is absent so the demo still walks.
 * Gated matter:read_all. Read-only — saving an answer as an artifact is a
 * separate POST /artifacts call.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getMatterAskContext } from "@aegis/matter";
import { callClaude } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";

const SCOPE_LABEL: Record<string, string> = {
  space: "this matter's own record",
  org: "the organization's legal knowledge",
  web: "general legal knowledge",
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const matterId = String(req.query.id || "");
  const question = String(req.body?.question || "").trim();
  const scope = String(req.body?.scope || "space");
  if (question.length < 3) return res.status(400).json({ ok: false, error: "Ask a question in a few words." });

  try {
    assertUserCanDo(user, Permission.MatterReadAll);
    const ctx = await getMatterAskContext(user.organizationId, matterId);
    if (!ctx) return res.status(404).json({ ok: false, error: "Matter not found" });

    const system =
      "You are AEGIS, an in-house legal operations assistant for a General Counsel's team. " +
      "Answer questions and draft documents scoped to the specific legal matter described. " +
      `Ground your answer in ${SCOPE_LABEL[scope] || SCOPE_LABEL.space}. ` +
      "Be concise, practical and specific. When asked to draft, return clean Markdown. " +
      "You never take an action or finalize anything — you inform the reviewer, who decides.";
    const prompt =
      `MATTER CONTEXT\nTitle: ${ctx.title}\nType: ${ctx.type}\nStatus: ${ctx.status}\n` +
      `Description: ${ctx.description || "—"}\nOpen tasks:\n` +
      `${ctx.openTasks.length ? ctx.openTasks.map((t) => `- ${t}`).join("\n") : "- none"}\n\n` +
      `QUESTION\n${question}`;

    try {
      ensureServerClaudeTransport();
      const answer = await callClaude(prompt, { system, maxTokens: 1400 });
      return res.status(200).json({ ok: true, answer, degraded: false, scope });
    } catch {
      return res.status(200).json({
        ok: true,
        degraded: true,
        scope,
        answer:
          "The AI assistant isn't configured in this environment (set ANTHROPIC_API_KEY to enable scoped answers). " +
          "In the meantime you can file this as a request from the command bar, and it will be triaged and routed to the right desk.",
      });
    }
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
