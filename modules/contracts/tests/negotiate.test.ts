import { describe, it, expect } from "vitest";
import { positionLadder, buildCounterProposal, describeMovement, movedHeadline } from "../src/internal/negotiate";
import type { PlaybookRuleDTO } from "../src/internal/playbook";

function rule(partial: Partial<PlaybookRuleDTO> & { clauseType: string; preferredText: string }): PlaybookRuleDTO {
  return {
    id: `rule-${partial.clauseType}`,
    clauseType: partial.clauseType,
    clauseCode: partial.clauseType,
    title: partial.clauseType,
    preferredText: partial.preferredText,
    fallbackTexts: partial.fallbackTexts ?? [],
    walkAwayText: partial.walkAwayText ?? null,
    required: partial.required ?? false,
    requiredLanguage: partial.requiredLanguage ?? null,
    guidance: partial.guidance ?? null,
    escalationTrigger: partial.escalationTrigger ?? null,
    precedentRefs: [],
    severityWeight: partial.severityWeight ?? 1,
    orderIndex: 0,
  };
}

const liability = rule({
  clauseType: "LIABILITY_CAP",
  preferredText: "Each party's aggregate liability is capped at the fees paid in the twelve months preceding the claim, excluding indirect and consequential damages.",
  fallbackTexts: ["Aggregate liability is capped at two times the fees paid in the prior twelve months."],
  walkAwayText: "We will not sign without any liability cap.",
  escalationTrigger: "No cap at all is a walk-away for the GC.",
  severityWeight: 3,
});

describe("positionLadder", () => {
  it("lays out preferred → fallback(s) → walk-away", () => {
    const ladder = positionLadder(liability);
    expect(ladder.map((r) => r.rung)).toEqual(["preferred", "fallback", "walk_away"]);
    expect(ladder[0].text).toContain("twelve months");
    expect(ladder[2].rung).toBe("walk_away");
  });

  it("omits an empty walk-away", () => {
    const ladder = positionLadder(rule({ clauseType: "X", preferredText: "P", fallbackTexts: ["F"] }));
    expect(ladder.map((r) => r.rung)).toEqual(["preferred", "fallback"]);
  });
});

describe("buildCounterProposal", () => {
  it("accepts a clause already on the standard position", () => {
    const p = buildCounterProposal(liability.preferredText, liability);
    expect(p.grade).toBe("STANDARD");
    expect(p.action).toBe("accept");
    expect(p.counterText).toBeNull();
  });

  it("holds the acceptable fallback but offers a push to preferred", () => {
    const p = buildCounterProposal("Aggregate liability is capped at two times the fees paid in the prior twelve months term.", liability);
    expect(p.grade).toBe("FALLBACK");
    expect(p.action).toBe("hold_fallback");
    expect(p.counterText).toBe(liability.preferredText);
  });

  it("surfaces the walk-away when they're off every rung", () => {
    const p = buildCounterProposal("There shall be no limitation of liability of any kind whatsoever for either party.", liability);
    expect(p.grade).toBe("ESCALATE");
    expect(p.action).toBe("walk_away");
    expect(p.counterText).toBe(liability.preferredText);
    expect(p.ladder.some((r) => r.rung === "walk_away")).toBe(true);
  });

  it("counters with preferred (no walk-away) when none is configured", () => {
    const noWalk = rule({ clauseType: "LIABILITY_CAP", preferredText: liability.preferredText, fallbackTexts: liability.fallbackTexts });
    const p = buildCounterProposal("No liability limitation whatsoever.", noWalk);
    expect(p.action).toBe("counter_preferred");
  });
});

describe("describeMovement", () => {
  it("flags a stall at a contested grade", () => {
    const m = describeMovement("LIABILITY_CAP", ["ESCALATE", "ESCALATE", "ESCALATE"]);
    expect(m.direction).toBe("stalled");
    expect(m.stalledTurns).toBe(3);
    expect(m.headline).toContain("stalled");
  });

  it("reads a move toward us", () => {
    const m = describeMovement("LIABILITY_CAP", ["ESCALATE", "FALLBACK"]);
    expect(m.direction).toBe("toward");
  });

  it("reads a resolution to standard", () => {
    const m = describeMovement("LIABILITY_CAP", ["FALLBACK", "STANDARD"]);
    expect(m.direction).toBe("resolved");
  });

  it("reads a move away", () => {
    const m = describeMovement("LIABILITY_CAP", ["FALLBACK", "ESCALATE"]);
    expect(m.direction).toBe("away");
  });

  it("a standard clause that stays standard is not a contested stall", () => {
    const m = describeMovement("GOVERNING_LAW", ["STANDARD", "STANDARD"]);
    expect(m.direction).toBe("resolved");
    expect(m.stalledTurns).toBe(0);
  });
});

describe("movedHeadline", () => {
  it("counts toward / away / stalled across clauses", () => {
    const line = movedHeadline([
      describeMovement("A", ["ESCALATE", "FALLBACK"]),      // toward
      describeMovement("B", ["FALLBACK", "ESCALATE"]),      // away
      describeMovement("C", ["ESCALATE", "ESCALATE", "ESCALATE"]), // stalled ≥2
    ]);
    expect(line).toContain("1 moved toward us");
    expect(line).toContain("1 moved away");
    expect(line).toContain("1 stalled");
  });

  it("reports no movement when there is none", () => {
    expect(movedHeadline([describeMovement("A", ["FALLBACK"])])).toContain("No graded movement");
  });
});
