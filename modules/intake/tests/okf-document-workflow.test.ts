/**
 * End-to-end regression for the "agent picks up a loaded document, works,
 * and delivers" flow — the NDA and Contract workflows — after the oKF
 * execution flip. Mocks @aegis/ai to capture the exact prompt the agent
 * sends, so we can prove the attached document + the playbook knowledge
 * reach the model and a real recommendation comes back.
 */
import { describe, it, expect, vi, afterEach, afterAll } from "vitest";

// Capture every prompt Claude is asked, and return a canned review.
const seenPrompts: string[] = [];
vi.mock("@aegis/ai", () => ({
  callClaudeJSON: vi.fn(async (prompt: string) => {
    seenPrompts.push(prompt);
    return { draftedResponse: "First-pass review: liability cap deviates (BLOCKER). Attorney sign-off required.", confidence: 0.6, reasoning: "Reviewed against playbook.", concerns: ["Attorney sign-off required before execution."] };
  }),
  callClaude: vi.fn(async (prompt: string) => { seenPrompts.push(prompt); return "Plain-text review."; }),
  friendlyAIError: (e: unknown) => String((e as Error)?.message || e),
}));

const { processTicketWithAgent, setOkfDocResolver } = await import("../src/agents/index.js");
const { staticDefForKey } = await import("../src/agents/okf/static-defs");

// The client fetches the published def; here we inject the static def as the
// server/runtime does, so the okf path resolves without a page origin.
setOkfDocResolver(async (agentKey: string) => staticDefForKey(agentKey));

const MSA_DOC = `Please review this Master Services Agreement.

--- attached document: acme-msa.txt ---
1. LIMITATION OF LIABILITY. Provider's total liability is UNLIMITED for all claims.
2. PAYMENT. Net 90 from invoice date.
3. GOVERNING LAW. Laws of the counterparty's home jurisdiction.`;

afterEach(() => { seenPrompts.length = 0; });
afterAll(() => setOkfDocResolver(null)); // restore the default resolver

describe("Contract workflow (oKF execution) — loaded doc → review", () => {
  it("the generalist reviewer (okf) feeds on the document + playbook and delivers a review", async () => {
    // Force the generalist reviewer (an MSA would otherwise be claimed by the
    // Contract-Type Specialist — see the natural-routing case below).
    const ticket = { id: "REQ-C1", from: "Dana Lee", dept: "Engineering", type: "Contract Review", desc: MSA_DOC };
    const { agent, recommendation } = await processTicketWithAgent(ticket, {}, "contract-review-agent");

    expect(agent?.id).toBe("contract-review-agent");
    expect(recommendation).toBeTruthy();
    expect(recommendation.draftedResponse).toContain("review");

    // The attached document text reached the model…
    const prompt = seenPrompts.join("\n");
    expect(prompt).toContain("UNLIMITED");
    expect(prompt).toContain("Net 90");
    // …and so did the playbook knowledge (the migrated clause library).
    expect(prompt.toLowerCase()).toContain("limitation of liability");
    // Advisory: first-pass review is never auto-sent without high confidence.
    expect(recommendation.suggestedAction).toBe("flag-for-review");
  });

  it("an MSA routes naturally to the Contract-Type Specialist, which delivers from the document", async () => {
    const ticket = { id: "REQ-C2", from: "Dana Lee", dept: "Engineering", type: "Contract Review", desc: MSA_DOC };
    const { agent, recommendation } = await processTicketWithAgent(ticket, {});

    expect(agent?.id).toBe("contract-specialist-agent");
    expect(recommendation).toBeTruthy();
    expect(seenPrompts.join("\n")).toContain("UNLIMITED"); // document reached it
  });
});

describe("NDA workflow (code execution) — loaded doc → response", () => {
  it("routes to the NDA agent and delivers a recommendation from the document", async () => {
    const ticket = { id: "REQ-N1", from: "Sam Patel", dept: "Sales", type: "NDA", desc: "Please paper an NDA.\n\n--- attached document: acme-nda.txt ---\nMutual NDA, 5-year term, unlimited indemnity." };
    const { agent, recommendation } = await processTicketWithAgent(ticket, {}, "nda-agent");

    expect(agent?.id).toBe("nda-agent");
    expect(recommendation).toBeTruthy();
    // NDA stays code execution; it still reaches Claude with the document.
    expect(seenPrompts.join("\n")).toContain("unlimited indemnity");
  });
});
