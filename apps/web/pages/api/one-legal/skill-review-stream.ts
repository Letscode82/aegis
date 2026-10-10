/**
 * POST /api/one-legal/skill-review-stream — the deep skill review, STREAMED.
 *
 * Same routing + governed playbook assembly as the buffered
 * `/api/one-legal/skill-review`, but the model's answer streams back
 * token-by-token as Server-Sent Events, so the review renders progressively
 * in ONE Legal (the Harvey / Legora / ChatGPT pattern). Streaming removes the
 * two failure modes of the buffered call on a long review: it can't "time
 * out" (data flows the whole time) and it can't be truncated by a token cap
 * squeezed to fit the function window — the user watches the whole review
 * appear and can Stop it early.
 *
 * Frame shape (one JSON object per `data:` frame):
 *   { type: "matched", matched }            — the resolved playbook (first)
 *   { type: "delta",   text }               — a chunk of the answer
 *   { type: "done",    degraded, aiError? } — stream finished
 *   { type: "note",    matched, note }      — skill matched but nothing to run
 *   { type: "error",   error }              — fatal before any delta
 *
 * The console degrades to the buffered /skill-review route when streaming is
 * unavailable. Gated intake:create_ticket — same as the other console routes.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { assertAndAudit } from "../../../lib/authz";
import { CLAUDE_MODEL, friendlyAIError } from "@aegis/ai";
import { streamAnthropicMessages } from "@aegis/ai/server";
import { recordSpan } from "@aegis/observability";
import { loadRegistryFromData, route, buildSystemPrompt, wrapDocuments, getSkill } from "@aegis/legal-skills";
import registryData from "@aegis/legal-skills/registry.json";

// Same budget rationale as the buffered route: give the stream the full ~60s
// function window. Because the answer streams, a cap only bounds worst-case
// length — it never truncates what the user sees.
export const config = { api: { bodyParser: { sizeLimit: "2mb" } }, maxDuration: 60 };

const REGISTRY = loadRegistryFromData(registryData as never);

// Abort the model a little before maxDuration so the function ends cleanly
// (the client keeps everything streamed up to that point).
const STREAM_DEADLINE_MS = 57000;
const MAX_TOKENS = 4000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  // Auth + routing happen before the stream opens, so a failure here is still
  // a normal JSON status response the client can read.
  let chosenId: string;
  let matched: { id: string; title: string; module: string; risk_tier: string; status: string };
  let system: string;
  let userMsg: string;
  let built = true;
  try {
    await assertAndAudit(user, Permission.IntakeCreateTicket, { route: "one-legal.skill-review-stream" });
    const body = (req.body || {}) as {
      text?: string;
      jurisdiction?: string;
      skillId?: string;
      documents?: Array<{ name?: string; text?: string }>;
    };
    const text = String(body.text || "").trim();
    if (text.length < 3) return res.status(400).json({ ok: false, error: "Describe the task in a few words." });
    const jurisdiction = String(body.jurisdiction || "").trim() || undefined;

    let chosen = body.skillId ? getSkill(REGISTRY, String(body.skillId)) : null;
    if (!chosen) {
      const [best] = route(REGISTRY, text, { jurisdiction });
      chosen = best ? getSkill(REGISTRY, best.id) : null;
    }
    if (!chosen) return res.status(200).json({ ok: true, matched: null, answer: "", note: "No matching skill." });

    chosenId = chosen.id;
    matched = { id: chosen.id, title: chosen.title, module: chosen.module, risk_tier: chosen.risk_tier, status: chosen.status };
    built = chosen.status === "built";

    const docs = Array.isArray(body.documents)
      ? body.documents.filter((d) => d && String(d.text || "").trim()).map((d) => ({ name: String(d.name || "document"), text: String(d.text) }))
      : [];

    system = buildSystemPrompt(REGISTRY, [chosen.id], {
      includeReferences: true,
      matter: { requestedBy: user.name || null, organizationId: user.organizationId },
    });
    // Ask for human-readable Markdown — the output contract's DEFAULT. (Asking
    // for `json` made the model stream a raw JSON object, which rendered as an
    // ugly code block in the console.) A tight, ranked Markdown review reads
    // well and streams naturally.
    const outputGuide =
      "Produce a COMPLETE but CONCISE review in clean Markdown (NOT JSON, no code fences): a short Bottom line, " +
      "then Findings highest-severity first — for each, the clause, its severity, the issue in one line, and a " +
      "one-line recommendation — then Actions. Do not repeat the document back or pad; finish the whole review.";
    userMsg = (docs.length ? wrapDocuments(docs) + "\n\n" : "") + `Task: ${text}\n\n${outputGuide}\n\nReturn format: markdown`;
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }

  // Open the SSE stream. Headers must be set before any write.
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  type Frame =
    | { type: "matched"; matched: typeof matched }
    | { type: "delta"; text: string }
    | { type: "done"; degraded: boolean; aiError?: string | null }
    | { type: "note"; matched: typeof matched; note: string }
    | { type: "error"; error: string };
  const send = (f: Frame): void => {
    res.write(`data: ${JSON.stringify(f)}\n\n`);
  };

  const t0 = Date.now();
  send({ type: "matched", matched });

  // A catalogued-but-not-yet-built skill has no body to run.
  if (!built) {
    send({ type: "note", matched, note: "This skill is catalogued but not yet built." });
    send({ type: "done", degraded: true });
    recordSpan("one_legal.skill_review_stream", Date.now() - t0, { skill: chosenId, built: false });
    return res.end();
  }

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), STREAM_DEADLINE_MS);
  let produced = false;
  let degraded = false;
  let aiError: string | null = null;
  try {
    await streamAnthropicMessages(
      {
        model: process.env.ANTHROPIC_MODEL || CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: "user", content: userMsg }],
      },
      {
        signal: controller.signal,
        onText: (text) => {
          produced = true;
          send({ type: "delta", text });
        },
      },
    );
  } catch (e) {
    // Surface the real reason either way. If nothing streamed, the client
    // degrades to the buffered route. If text already streamed, the user keeps
    // what arrived AND sees an "interrupted — retry" note instead of a silent
    // cut-off (the failure mode the earlier version had).
    degraded = true;
    aiError = produced
      ? "The review was interrupted before it finished — retry to get the whole thing."
      : friendlyAIError(e as never);
    console.error(
      "[one-legal:skill-review-stream] model stream failed:",
      (e as { status?: number })?.status ?? "",
      (e as Error)?.message || e,
    );
  } finally {
    clearTimeout(deadline);
  }

  send({ type: "done", degraded, aiError });
  recordSpan("one_legal.skill_review_stream", Date.now() - t0, { skill: chosenId, built: true, degraded, produced });
  return res.end();
}
