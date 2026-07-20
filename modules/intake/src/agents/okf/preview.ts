/**
 * Agent Designer preview — dry-run an agent's CURRENT (draft) definition
 * against a sample ticket, server-side, with the real Claude transport.
 * Produces the recommendation the published definition WOULD generate,
 * without persisting anything and without touching the AgentDecision gate.
 * This is how the Designer's "Preview" button shows the effect of an edit
 * before publish.
 */
import { ensureServerClaudeTransport } from "@aegis/ai/server";
import { callClaude, callClaudeJSON, friendlyAIError } from "@aegis/ai";
import { runDefinition } from "./runtime";
import { buildRec, buildDegradedRec } from "../build-rec.js";
import { getAgentDocument } from "./store";

/**
 * AI-assisted knowledge authoring — drafts a single KnowledgeItem
 * (title + body) from a short instruction. The human reviews and saves;
 * nothing is persisted here (same discipline as the template generator).
 */
export async function draftKnowledgeItem(
  instruction: string,
  opts: { packName: string; kind: string },
): Promise<{ title: string; body: string }> {
  ensureServerClaudeTransport();
  const prompt =
    `You are helping a General Counsel author one knowledge entry for a legal AI agent's "${opts.packName}" pack (item kind: ${opts.kind}). ` +
    `Draft a concise, accurate entry for this request: "${instruction}". ` +
    `Keep the body to 1-3 sentences of practical legal-ops guidance — no preamble. ` +
    `Respond with ONLY this JSON: {"title":"a short title","body":"the guidance"}.`;
  try {
    const result = await callClaudeJSON(prompt, { maxTokens: 500, timeout: 30000 });
    return { title: String(result.title || instruction).slice(0, 120), body: String(result.body || "") };
  } catch {
    // Plain-text fallback so authoring still works if JSON truncates.
    const prose = await callClaude(`${prompt}\n\n(Plain text: first line = title, rest = body.)`, { maxTokens: 500, timeout: 30000 });
    const lines = String(prose || "").trim().split("\n");
    return { title: (lines[0] || instruction).slice(0, 120), body: lines.slice(1).join("\n").trim() };
  }
}

export interface PreviewTicket {
  from?: string;
  dept?: string;
  type?: string;
  desc?: string;
  hasDocument?: boolean;
}

export async function previewAgentDefinition(
  organizationId: string,
  agentKey: string,
  ticket: PreviewTicket,
) {
  ensureServerClaudeTransport();
  const doc = await getAgentDocument(organizationId, agentKey);
  if (!doc) return null;
  const recommendation = await runDefinition(ticket, doc, doc.knowledge, {
    callClaude,
    callClaudeJSON,
    buildRec,
    buildDegradedRec,
    friendlyAIError,
  });
  return { recommendation, agentKey: doc.agent.key };
}
