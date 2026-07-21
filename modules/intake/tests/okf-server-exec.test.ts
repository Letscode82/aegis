import { describe, it, expect, afterEach } from "vitest";
import { processTicketWithAgent, setOkfDocResolver } from "../src/agents/index.js";
import { staticDefForKey } from "../src/agents/okf/static-defs";

// oKF-6: the server runner injects a DB-backed doc resolver so server-
// created tickets take the SAME oKF execution path as the browser. Here we
// inject a resolver (as run-server does) and confirm processTicketWithAgent
// routes an "okf" agent through it. callClaude has no transport in the test
// env, so the runtime degrades — but the point is that the oKF path (not
// process()) was taken, proven by the resolver being consulted.

describe("oKF-6 server-side execution unification", () => {
  afterEach(() => setOkfDocResolver(null)); // restore the default fetch resolver

  it("routes an okf agent through the injected resolver (not a page fetch)", async () => {
    const seen: string[] = [];
    setOkfDocResolver(async (agentKey: string) => {
      seen.push(agentKey);
      return staticDefForKey(agentKey); // contract-review = executionMode "okf"
    });

    const ticket = { id: "t-okf-6", type: "Contract Review", desc: "Please review this agreement.", from: "Dana Lee", dept: "Engineering" };
    const { agent, recommendation } = await processTicketWithAgent(ticket, {}, "contract-review-agent");

    expect(agent?.id).toBe("contract-review-agent");
    expect(seen).toContain("contract-review-agent"); // resolver consulted → oKF path taken
    expect(recommendation).toBeTruthy(); // degraded (no transport) but produced
    expect(recommendation.agentId).toBe("contract-review-agent");
  });

  it("a code agent short-circuits to process() even when a resolver is set", async () => {
    const seen: string[] = [];
    setOkfDocResolver(async (agentKey: string) => {
      seen.push(agentKey);
      return staticDefForKey(agentKey); // nda = executionMode "code"
    });

    const ticket = { id: "t-okf-6b", type: "NDA", desc: "New NDA with Acme.", from: "Dana Lee", dept: "Legal" };
    const { agent } = await processTicketWithAgent(ticket, {}, "nda-agent");

    expect(agent?.id).toBe("nda-agent");
    // resolver may be consulted, but the code agent's def is executionMode
    // "code" → tryOkfExecution returns null → process() runs. No throw.
  });
});
