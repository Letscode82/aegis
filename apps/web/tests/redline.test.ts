import { describe, it, expect } from "vitest";
import { buildRedline, applyRedline, countChanges, type RedlineOp } from "../lib/one-legal/redline";

describe("buildRedline", () => {
  it("returns a single equal op when nothing changed", () => {
    const ops = buildRedline("the quick brown fox", "the quick brown fox");
    expect(countChanges(ops)).toBe(0);
    expect(ops.every((o) => o.kind === "equal")).toBe(true);
  });

  it("captures a pure insertion as a change with only `ins`", () => {
    // Space-separated so the added words tokenize cleanly as an insertion
    // (punctuation glued to a word would read as a replacement — correct, but
    // not what this case checks).
    const ops = buildRedline("term is 2 years", "term is 2 years and renewable");
    expect(countChanges(ops)).toBe(1);
    const change = ops.find((o) => o.kind === "change") as Extract<RedlineOp, { kind: "change" }>;
    expect(change.del).toBe("");
    expect(change.ins).toMatch(/renewable/);
  });

  it("captures a pure deletion as a change with only `del`", () => {
    const ops = buildRedline("liability is uncapped and broad", "liability is broad");
    const change = ops.find((o) => o.kind === "change") as Extract<RedlineOp, { kind: "change" }>;
    expect(change.ins).toBe("");
    expect(change.del).toMatch(/uncapped/);
  });

  it("pairs a replacement (delete+insert) into one change", () => {
    const ops = buildRedline("governed by California law", "governed by Delaware law");
    expect(countChanges(ops)).toBe(1);
    const change = ops.find((o) => o.kind === "change") as Extract<RedlineOp, { kind: "change" }>;
    expect(change.del).toMatch(/California/);
    expect(change.ins).toMatch(/Delaware/);
  });

  it("assigns stable sequential ids to changes", () => {
    const ops = buildRedline("a b c d", "a X c Y");
    const ids = ops.filter((o) => o.kind === "change").map((o) => (o as Extract<RedlineOp, { kind: "change" }>).id);
    expect(ids).toEqual([0, 1]);
  });
});

describe("applyRedline", () => {
  const ops = buildRedline("governed by California law", "governed by Delaware law");
  const changeId = (ops.find((o) => o.kind === "change") as Extract<RedlineOp, { kind: "change" }>).id;

  it("defaults an undecided change to ACCEPT (opt-out model)", () => {
    expect(applyRedline(ops, {})).toBe("governed by Delaware law");
  });

  it("reject keeps the original text", () => {
    expect(applyRedline(ops, { [changeId]: "reject" })).toBe("governed by California law");
  });

  it("accept keeps the revised text", () => {
    expect(applyRedline(ops, { [changeId]: "accept" })).toBe("governed by Delaware law");
  });

  it("round-trips a mixed accept/reject to a coherent document", () => {
    const base = "The term is 1 year. Liability is uncapped. Law is California.";
    const revised = "The term is 2 years. Liability is capped. Law is Delaware.";
    const o = buildRedline(base, revised);
    expect(countChanges(o)).toBeGreaterThanOrEqual(3);
    // Reject every change → exactly the base document back.
    const rejectAll: Record<number, "reject"> = {};
    for (const op of o) if (op.kind === "change") rejectAll[op.id] = "reject";
    expect(applyRedline(o, rejectAll)).toBe(base);
    // Accept every change → exactly the revised document.
    expect(applyRedline(o, {})).toBe(revised);
  });
});
