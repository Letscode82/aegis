/**
 * POST /api/one-legal/skill-review — run an @aegis/legal-skills playbook (first
 * live use of the package).
 *
 * Routes the request to the best-matching legal skill, assembles the shared
 * standards + that skill's playbook as the system prompt (with the matter record
 * and any pasted documents wrapped as DATA, not instructions), and runs it
 * through the governed @aegis/ai proxy. Returns the matched skill + the model's
 * structured answer (the skill's JSON output contract).
 *
 * Additive + degrade-safe: this does not touch the existing oKF intake agents or
 * their AgentDecision gate. With no model available it returns the matched skill
 * and its summary so the caller still gets the right playbook. Skills carry
 * `risk_tier` / review status — treat `review-required` output as a draft until a
 * lawyer signs off (same governance posture the package defines).
 *
 * Gated intake:create_ticket — same as the other ONE Legal console routes.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { assertAndAudit } from "../../../lib/authz";
import { callClaude, friendlyAIError } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";
import { recordSpan } from "@aegis/observability";
import { loadRegistryFromData, route, buildSystemPrompt, wrapDocuments, getSkill } from "@aegis/legal-skills";
// The built registry is imported (bundled) rather than read from disk, so this
// works inside the Next serverless bundle — see loadRegistryFromData.
import registryData from "@aegis/legal-skills/registry.json";

// maxDuration: the deep skill review carries a large playbook system prompt
// (~13K tokens), so the model call runs longer than the light routes. Without
// an explicit cap the function uses Vercel's short default (~10-15s) and the
// platform kills the request mid-call — which surfaced as a generic "AI
// unavailable" even though the model was healthy. 60s gives the call room; the
// callClaude timeout below still aborts first and reports a precise reason.
export const config = { api: { bodyParser: { sizeLimit: "2mb" } }, maxDuration: 60 };

// Build the index once per warm lambda.
const REGISTRY = loadRegistryFromData(registryData as never);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    await assertAndAudit(user, Permission.IntakeCreateTicket, { route: "one-legal.skill-review" });
    const t0 = Date.now();
    const body = (req.body || {}) as {
      text?: string;
      jurisdiction?: string;
      skillId?: string;
      documents?: Array<{ name?: string; text?: string }>;
    };
    const text = String(body.text || "").trim();
    if (text.length < 3) return res.status(400).json({ ok: false, error: "Describe the task in a few words." });
    const jurisdiction = String(body.jurisdiction || "").trim() || undefined;

    // Pick the skill: explicit skillId wins, else route by the text.
    let chosen = body.skillId ? getSkill(REGISTRY, String(body.skillId)) : null;
    if (!chosen) {
      const [best] = route(REGISTRY, text, { jurisdiction });
      chosen = best ? getSkill(REGISTRY, best.id) : null;
    }
    if (!chosen) return res.status(200).json({ ok: true, matched: null, answer: "", note: "No matching skill." });

    const matched = { id: chosen.id, title: chosen.title, module: chosen.module, risk_tier: chosen.risk_tier, status: chosen.status };

    // Planned (not-yet-built) skills have no body to run — return the match only.
    if (chosen.status !== "built") {
      recordSpan("one_legal.skill_review", Date.now() - t0, { skill: chosen.id, built: false });
      return res.status(200).json({ ok: true, matched, answer: "", degraded: true, note: "This skill is catalogued but not yet built." });
    }

    const docs = Array.isArray(body.documents)
      ? body.documents.filter((d) => d && String(d.text || "").trim()).map((d) => ({ name: String(d.name || "document"), text: String(d.text) }))
      : [];

    const system = buildSystemPrompt(REGISTRY, [chosen.id], {
      includeReferences: true,
      matter: { requestedBy: user.name || null, organizationId: user.organizationId },
    });
    const userMsg = (docs.length ? wrapDocuments(docs) + "\n\n" : "") + `Task: ${text}\n\nReturn format: json`;

    let answer = "";
    let degraded = false;
    let aiError: string | null = null;
    try {
      ensureServerClaudeTransport();
      // A full clause-by-clause playbook review runs long — 1500 output tokens
      // truncated the result mid-sentence. Give it room to finish; the 45s
      // timeout still fits under the route's 60s maxDuration.
      answer = ((await callClaude(userMsg, { system, maxTokens: 4000, timeout: 45000 })) || "").trim();
      if (!answer) throw new Error("empty response from model");
    } catch (e) {
      degraded = true;
      // Surface the REAL reason (rate limit / overload / bad model id / out of
      // credit / network) instead of a blanket "AI is offline". This heavier
      // call (large playbook system prompt) can hit a transient upstream error
      // while the model is perfectly reachable for lighter calls elsewhere —
      // reporting a flat "offline" there is misleading. The console.error is
      // the server-log breadcrumb; `aiError` is the user-facing reason.
      console.error(
        "[one-legal:skill-review] model execution failed:",
        (e as { status?: number })?.status ?? "",
        (e as Error)?.message || e,
      );
      aiError = friendlyAIError(e as never);
      answer = `Matched the "${chosen.title}" playbook (${chosen.module}). ${aiError} You can retry, or open the skill to run it manually. A qualified lawyer should review before anything is sent.`;
    }

    recordSpan("one_legal.skill_review", Date.now() - t0, { skill: chosen.id, built: true, degraded });
    return res.status(200).json({ ok: true, matched, answer, degraded, aiError });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
