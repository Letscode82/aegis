import { describe, it, expect } from "vitest";
import {
  classifyPlaybookStatus,
  recommendationFor,
  buildPosition,
  summarizeRedlineChange,
  redlineHeadline,
  type CurrentClause,
} from "../src/internal/negotiation-intelligence";
import type { ClauseLibraryEntryDTO } from "../src/internal/clause-library";
import type { ClauseChange, SnapshotClause } from "../src/internal/versions";

const entry = (over: Partial<ClauseLibraryEntryDTO> = {}): ClauseLibraryEntryDTO => ({
  id: "k1",
  clauseType: "LIABILITY_CAP",
  title: "Limitation of Liability",
  standardText: "Capped at 12 months' fees.",
  fallbackText: "Capped at 2x 12 months' fees.",
  guidance: "Never go uncapped.",
  riskIfDeviated: "HIGH",
  active: true,
  sortOrder: 0,
  ...over,
});

const snap = (over: Partial<SnapshotClause> = {}): SnapshotClause => ({
  type: "LIABILITY_CAP",
  text: "x",
  summary: null,
  risk: "MEDIUM",
  deviation: false,
  ...over,
});

describe("classifyPlaybookStatus", () => {
  it("no library entry → no_position", () => {
    expect(classifyPlaybookStatus(false, null)).toBe("no_position");
    expect(classifyPlaybookStatus(true, undefined)).toBe("no_position");
  });
  it("not deviating → on_standard", () => {
    expect(classifyPlaybookStatus(false, entry())).toBe("on_standard");
  });
  it("deviating with a fallback → fallback_available", () => {
    expect(classifyPlaybookStatus(true, entry())).toBe("fallback_available");
  });
  it("deviating with no fallback → off_playbook", () => {
    expect(classifyPlaybookStatus(true, entry({ fallbackText: null }))).toBe("off_playbook");
    expect(classifyPlaybookStatus(true, entry({ fallbackText: "   " }))).toBe("off_playbook");
  });
});

describe("recommendationFor", () => {
  it("gives a distinct deterministic sentence per status", () => {
    const recs = (["on_standard", "fallback_available", "off_playbook", "no_position"] as const).map(recommendationFor);
    expect(new Set(recs).size).toBe(4);
    expect(recommendationFor("fallback_available")).toMatch(/fallback/i);
    expect(recommendationFor("off_playbook")).toMatch(/escalate/i);
  });
});

describe("buildPosition", () => {
  it("projects a current clause + library entry into a position", () => {
    const current: CurrentClause = { type: "LIABILITY_CAP", text: "Uncapped.", risk: "HIGH", deviation: true };
    const p = buildPosition(current, entry());
    expect(p).toMatchObject({
      clauseType: "LIABILITY_CAP",
      title: "Limitation of Liability",
      standardText: "Capped at 12 months' fees.",
      fallbackText: "Capped at 2x 12 months' fees.",
      riskIfDeviated: "HIGH",
      status: "fallback_available",
    });
    expect(p.current).toEqual({ text: "Uncapped.", risk: "HIGH", deviation: true });
    expect(p.recommendation).toMatch(/fallback/i);
  });

  it("humanizes the type for the title when there is no library entry", () => {
    const current: CurrentClause = { type: "NON_SOLICIT", text: "...", risk: "LOW", deviation: false };
    const p = buildPosition(current, undefined);
    expect(p.title).toBe("Non Solicit");
    expect(p.status).toBe("no_position");
    expect(p.standardText).toBeNull();
  });
});

describe("summarizeRedlineChange", () => {
  it("summarizes an added clause and flags a deviating add", () => {
    const change: ClauseChange = { kind: "added", key: "INDEMNITY#0", type: "INDEMNITY", to: snap({ type: "INDEMNITY", deviation: true }) };
    const item = summarizeRedlineChange(change);
    expect(item.kind).toBe("added");
    expect(item.headline).toMatch(/Indemnity added \(deviates from playbook\)\./);
  });

  it("summarizes a removed clause", () => {
    const change: ClauseChange = { kind: "removed", key: "TERM#0", type: "TERM", from: snap({ type: "TERM" }) };
    expect(summarizeRedlineChange(change).headline).toBe("Term removed.");
  });

  it("reports an introduced deviation and a risk escalation on a changed clause", () => {
    const change: ClauseChange = {
      kind: "changed", key: "LIABILITY_CAP#0", type: "LIABILITY_CAP",
      from: snap({ risk: "MEDIUM", deviation: false }),
      to: snap({ risk: "HIGH", deviation: true, text: "y" }),
      fields: ["text", "risk", "deviation"],
    };
    const item = summarizeRedlineChange(change);
    expect(item.deviationDelta).toBe("introduced");
    expect(item.riskDelta).toEqual({ from: "MEDIUM", to: "HIGH" });
    expect(item.headline).toMatch(/wording changed/);
    expect(item.headline).toMatch(/now deviates from playbook/);
    expect(item.headline).toMatch(/risk MEDIUM → HIGH/);
  });

  it("reports a resolved deviation", () => {
    const change: ClauseChange = {
      kind: "changed", key: "LIABILITY_CAP#0", type: "LIABILITY_CAP",
      from: snap({ deviation: true }), to: snap({ deviation: false }),
      fields: ["deviation"],
    };
    const item = summarizeRedlineChange(change);
    expect(item.deviationDelta).toBe("resolved");
    expect(item.headline).toMatch(/back within playbook/);
  });
});

describe("redlineHeadline", () => {
  it("says nothing moved when counts are zero", () => {
    expect(redlineHeadline({ added: 0, removed: 0, changed: 0, unchanged: 5 })).toMatch(/No clause-level change/);
  });
  it("counts the movement and pluralizes", () => {
    expect(redlineHeadline({ added: 1, removed: 0, changed: 0, unchanged: 3 })).toMatch(/moved 1 clause: 1 added\./);
    expect(redlineHeadline({ added: 1, removed: 1, changed: 2, unchanged: 0 })).toMatch(/moved 4 clauses: 2 changed, 1 added, 1 removed\./);
  });
});
