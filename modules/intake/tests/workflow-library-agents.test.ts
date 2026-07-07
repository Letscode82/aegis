/**
 * W-D cross-check — every AGENT step in the governance workflow
 * library binds an agentKey that resolves in the intake module's live
 * agent registry. Guards against the library drifting when agents are
 * renamed (the one-brain contract: ladders and agents share ids).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@aegis/ai", () => ({
  callClaudeJSON: vi.fn(),
  friendlyAIError: () => "AI unavailable.",
  classifyIntakeRegex: () => null,
}));
vi.mock("../src/storage/agent-log", () => ({ appendAgentLog: vi.fn() }));

const { AGENTS_BY_ID } = await import("../src/agents/index");
const { GOVERNANCE_LIBRARY } = await import("@aegis/workflow");

describe("governance library ↔ agent registry", () => {
  it("every AGENT step's agentKey resolves to a registered, production-ready agent", () => {
    for (const ladder of GOVERNANCE_LIBRARY) {
      for (const step of ladder.steps) {
        if (step.kind === "AGENT") {
          const key = (step.agentConfigJson as { agentKey?: string }).agentKey!;
          const agent = (AGENTS_BY_ID as Record<string, { productionReady?: boolean }>)[key];
          expect(agent, `${ladder.key} step ${step.stepOrder} binds unknown agent '${key}'`).toBeTruthy();
          expect(agent.productionReady, `${ladder.key} binds non-production agent '${key}'`).toBe(true);
        }
      }
    }
  });
});
