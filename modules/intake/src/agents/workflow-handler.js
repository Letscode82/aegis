import { AGENTS_BY_ID } from "./index.js";

// Runs a workflow AGENT-step task with the intake agent registry
// (program: auto-run agent steps). The step's agentConfigJson.agentKey
// names WHICH agent runs; we execute that agent's process() against the
// ladder's stored ticket context and return findings for the
// WorkflowAgentTask. The agent's own catch-block degrades gracefully,
// so this never throws on an AI outage.
export async function intakeWorkflowAgentHandler(input) {
  const agentKey = input?.agentConfig?.agentKey;
  const agent = agentKey ? AGENTS_BY_ID[agentKey] : null;
  if (!agent) throw new Error(`No registered agent '${agentKey ?? "(unset)"}'`);
  const ticket = (input?.context?.ticket ?? input?.context ?? {});
  const rec = await agent.process(ticket);
  return {
    confidence: typeof rec.confidence === "number" ? rec.confidence : 0,
    suggestedAction: rec.suggestedAction ?? "flag-for-review",
    summary: rec.reasoning ?? "",
    detail: {
      draftedResponse: rec.draftedResponse ?? null,
      concerns: rec.concerns ?? [],
      playbook: rec.playbook ?? null,
    },
  };
}
