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
