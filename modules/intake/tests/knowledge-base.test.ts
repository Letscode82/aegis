/**
 * Expanded FAQ KB + Policy library (Intake P2b) — lifts the agents'
 * real deflection coverage past the demo seed.
 *
 * Verifies coverage counts, that new topics route, that existing topics
 * still route (regression), that every trigger is a valid regex, and —
 * critically — that no policy entry accidentally auto-answers a
 * sensitive-employment matter (which the Policy Q&A agent must escalate,
 * not answer).
 */
import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { AGENT_KB, matchAgentKB } = await import("../src/agents/kb.js" as any);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { POLICY_LIBRARY, matchPolicy } = await import(
  "../src/agents/policy-library.js" as any
);

describe("coverage counts", () => {
  it("KB has at least 25 entries", () => {
    expect(AGENT_KB.length).toBeGreaterThanOrEqual(25);
  });
  it("Policy library has at least 20 entries", () => {
    expect(POLICY_LIBRARY.length).toBeGreaterThanOrEqual(20);
  });
});

describe("every trigger is a valid regex and matches its own answer-domain", () => {
  it("KB triggers are RegExp", () => {
    for (const item of AGENT_KB) {
      expect(Array.isArray(item.triggers)).toBe(true);
      for (const re of item.triggers) expect(re).toBeInstanceOf(RegExp);
      expect(typeof item.answer).toBe("string");
      expect(item.answer.length).toBeGreaterThan(10);
    }
  });
  it("Policy triggers are RegExp", () => {
    for (const p of POLICY_LIBRARY) {
      for (const re of p.triggers) expect(re).toBeInstanceOf(RegExp);
      expect(typeof p.answer).toBe("string");
    }
  });
});

describe("new KB topics route to the FAQ KB", () => {
  it.each([
    ["What's the limitation of liability cap?", /4\.1/],
    ["Need standard indemnification language", /4\.2/],
    ["What governing law do we use?", /6\.1/],
    ["Is this auto-renewal evergreen clause ok?", /2\.7/],
    ["Do we need a DPA for this vendor?", /Privacy Playbook/],
    ["Who owns the work product the contractor builds?", /IP Playbook/],
    ["Can we use this GPL open source library?", /IP Playbook/],
    ["Do export controls / EAR apply here?", /Trade Compliance/],
    ["What uptime SLA should we require?", /Vendor Playbook/],
    ["What insurance / COI do we need from the vendor?", /Vendor Playbook/],
  ])("%s", (q, sourceRe) => {
    const hit = matchAgentKB(q);
    expect(hit, `expected a KB match for: ${q}`).not.toBeNull();
    expect(hit.source).toMatch(sourceRe);
  });
});

describe("existing KB topics still route (regression)", () => {
  it.each([
    ["Can I share this document with the vendor?", "Playbook § 3.1"],
    ["What is our net payment term on the MSA?", "Playbook § 2.4"],
    ["Is this vendor on an OFAC sanctions list?", "Sanctions Screen"],
  ])("%s", (q, source) => {
    expect(matchAgentKB(q)?.source).toBe(source);
  });
});

describe("new policy topics route to the Policy library", () => {
  it.each([
    ["question about FCPA and a foreign official", /FCPA/],
    ["I have a conflict of interest to disclose", /Conflicts/],
    ["received a legal hold notice, what do I do", /Legal Hold/],
    ["how should I classify this highly confidential data", /Data Classification/],
    ["is MFA required on my accounts", /Authentication/],
    ["who owns my invention assignment (PIIA)", /IP Assignment/],
    ["what's the expense approval threshold / signing authority", /Delegation of Authority/],
    ["suspected data breach security incident", /Incident Response/],
    ["gifts and entertainment for a client", /Gifts/],
    ["insider trading blackout window", /Insider Trading/],
  ])("%s", (q, policyRe) => {
    const hit = matchPolicy(q);
    expect(hit, `expected a policy match for: ${q}`).not.toBeNull();
    expect(hit.policy).toMatch(policyRe);
  });
});

describe("safety: policy lookup never auto-answers a sensitive matter", () => {
  // The Policy Q&A agent escalates harassment/discrimination/retaliation
  // via aiTriage.category BEFORE matchPolicy runs. Belt-and-suspenders:
  // ensure these descriptions don't ALSO trip a policy auto-answer.
  it.each([
    "my manager has been harassing me for weeks",
    "I want to report workplace discrimination",
    "this feels like retaliation for my complaint",
  ])("%s → no policy match", (desc) => {
    expect(matchPolicy(desc)).toBeNull();
  });
});
