/**
 * Agent 9 · Notice Management — deterministic deadline extraction,
 * taxonomy, SLA sizing, and the agent's escalation posture.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const callClaudeJSONMock = vi.fn();
vi.mock("@aegis/ai", () => ({
  callClaudeJSON: callClaudeJSONMock,
  friendlyAIError: (e: unknown) => `AI unavailable: ${String(e)}`,
}));

const { extractDeadlines, classifyNotice, slaHoursForDeadlines } = await import(
  "../src/agents/notice-dates"
);
const { NoticeMgmtAgent } = await import("../src/agents/notice-mgmt");
const { LitigationAgent } = await import("../src/agents/litigation");
const { routeToAgent } = await import("../src/agents/index");

// Fixed receipt: 2026-07-01T00:00:00Z.
const RECEIVED = Date.UTC(2026, 6, 1);
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  callClaudeJSONMock.mockReset().mockResolvedValue({
    draftedResponse: "SITUATION BRIEF:\nbrief text",
    alternativeTone: "one line",
    confidence: 0.8,
    reasoning: "test",
  });
});

describe("extractDeadlines — deterministic, cited", () => {
  it("parses explicit dates in several formats with source context", () => {
    const dls = extractDeadlines(
      "You must respond by July 15, 2026. A hearing is set for 2026-08-01, and payment is due 20 August 2026.",
      RECEIVED,
    );
    expect(dls.map((d) => new Date(d.deadlineTs).toISOString().slice(0, 10)))
      .toEqual(["2026-07-15", "2026-08-01", "2026-08-20"]);
    expect(dls[0]!.kind).toBe("explicit");
    expect(dls[0]!.sourceText).toContain("July 15, 2026");
  });

  it("computes 'within N days of receipt' from the receipt date", () => {
    const dls = extractDeadlines(
      "You are required to cure the breach within 30 days of receipt of this notice.",
      RECEIVED,
    );
    expect(dls).toHaveLength(1);
    expect(dls[0]!).toMatchObject({ kind: "computed", days: 30, business: false });
    expect(dls[0]!.deadlineTs).toBe(RECEIVED + 30 * DAY);
  });

  it("computes business days by skipping weekends", () => {
    // 2026-07-01 is a Wednesday; 5 business days later = Wed 2026-07-08.
    const dls = extractDeadlines("respond no later than 5 business days from receipt", RECEIVED);
    expect(new Date(dls[0]!.deadlineTs).toISOString().slice(0, 10)).toBe("2026-07-08");
    expect(dls[0]!.business).toBe(true);
  });

  it("flags lapsed deadlines and DD/MM ambiguity, dedupes same-day hits", () => {
    const dls = extractDeadlines(
      "The deadline of June 1, 2026 has passed. Respond by 03/04/2027. Also respond by within 300 days.",
      RECEIVED,
    );
    const lapsed = dls.find((d) => d.lapsed);
    expect(lapsed).toBeTruthy();
    const slash = dls.find((d) => d.ambiguous);
    expect(slash).toBeTruthy();
  });
});

describe("classifyNotice — doc taxonomy order", () => {
  it("ranks regulatory > statutory > breach > demand > informational", () => {
    expect(classifyNotice("show cause notice from the regulator").category).toBe("regulatory");
    expect(classifyNotice("statutory notice under section 138 of the act").category).toBe("statutory");
    expect(classifyNotice("notice of breach — cure period of 30 days").category).toBe("breach_termination");
    expect(classifyNotice("demand for payment of overdue invoice").category).toBe("demand");
    expect(classifyNotice("notice of change of address").category).toBe("informational");
  });
});

describe("slaHoursForDeadlines", () => {
  it("sizes to the shortest deadline, floors lapsed at 4h, falls back when none", () => {
    const dls = extractDeadlines("respond within 3 days of receipt", RECEIVED);
    expect(slaHoursForDeadlines(dls, RECEIVED, 24)).toBe(72);
    expect(slaHoursForDeadlines([], RECEIVED, 24)).toBe(24);
    const lapsed = [{ sourceText: "x", deadlineTs: RECEIVED - DAY, kind: "explicit" as const, lapsed: true }];
    expect(slaHoursForDeadlines(lapsed, RECEIVED, 24)).toBe(4);
  });
});

describe("NoticeMgmtAgent", () => {
  const base = { id: "n1", from: "Mail Room", dept: "Legal", type: "Legal Notice", submittedTs: RECEIVED };

  it("escalates regulatory notices and cites every deadline with source text", async () => {
    const rec = (await NoticeMgmtAgent.process({
      ...base,
      desc: "Show cause notice from the regulator — respond within 14 days of receipt.",
    })) as { suggestedAction: string; concerns: string[]; proposedSlaHours: number };
    expect(rec.suggestedAction).toBe("escalate");
    expect(rec.concerns.some((c) => /Deadline 2026-07-15.*source:/.test(c))).toBe(true);
    expect(rec.proposedSlaHours).toBe(14 * 24);
  });

  it("escalates any deadline under 7 days even when informational", async () => {
    const rec = (await NoticeMgmtAgent.process({
      ...base,
      desc: "Informational notice: confirm receipt within 3 days of receipt.",
    })) as { suggestedAction: string };
    expect(rec.suggestedAction).toBe("escalate");
  });

  it("flags (not escalates) a demand with a comfortable deadline", async () => {
    const rec = (await NoticeMgmtAgent.process({
      ...base,
      desc: "Demand for payment of overdue invoice. Please remit by August 30, 2026.",
    })) as { suggestedAction: string };
    expect(rec.suggestedAction).toBe("flag-for-review");
  });

  it("degraded path (Claude down) still ships every deterministic deadline + minimal ack", async () => {
    callClaudeJSONMock.mockRejectedValue(new Error("boom"));
    const rec = (await NoticeMgmtAgent.process({
      ...base,
      desc: "Notice of breach — cure within 30 days of receipt.",
    })) as { concerns: string[]; draftedResponse: string; suggestedAction: string; proposedSlaHours: number };
    expect(rec.concerns.some((c) => /Deadline 2026-07-31/.test(c))).toBe(true);
    expect(rec.draftedResponse).toContain("rights and remedies are expressly reserved");
    expect(rec.suggestedAction).toBe("flag-for-review"); // degraded invariant
    expect(rec.proposedSlaHours).toBe(30 * 24);
  });

  it("routing: notices go to Notice agent; court paper stays with Litigation", () => {
    expect(
      routeToAgent({ id: "x", type: "Legal Notice", desc: "We received a notice of breach with a cure period" }, undefined),
    ).toBe(NoticeMgmtAgent);
    expect(
      routeToAgent({ id: "y", type: "Litigation Notice", desc: "We have been served with a summons" }, undefined),
    ).toBe(LitigationAgent);
  });
});
