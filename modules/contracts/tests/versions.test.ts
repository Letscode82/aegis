import { describe, it, expect } from "vitest";
import { diffClauseSets, diffCounts } from "../src/internal/versions";

const cl = (type: string, text: string, risk = "LOW", deviation = false, summary: string | null = null) =>
  ({ type, text, risk, deviation, summary } as never);

describe("diffClauseSets", () => {
  it("detects an added clause", () => {
    const d = diffClauseSets([cl("IP", "x")], [cl("IP", "x"), cl("PAYMENT", "net 45")]);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ kind: "added", type: "PAYMENT" });
  });

  it("detects a removed clause", () => {
    const d = diffClauseSets([cl("IP", "x"), cl("WARRANTY", "90d")], [cl("IP", "x")]);
    expect(d.filter((c) => c.kind === "removed")).toHaveLength(1);
    expect(d[0]).toMatchObject({ kind: "removed", type: "WARRANTY" });
  });

  it("detects a text change and reports the field", () => {
    const d = diffClauseSets([cl("LIABILITY_CAP", "12 months")], [cl("LIABILITY_CAP", "24 months")]);
    expect(d).toHaveLength(1);
    expect(d[0].kind).toBe("changed");
    if (d[0].kind === "changed") expect(d[0].fields).toContain("text");
  });

  it("detects risk + deviation changes", () => {
    const d = diffClauseSets([cl("IP", "same", "LOW", false)], [cl("IP", "same", "HIGH", true)]);
    expect(d[0].kind).toBe("changed");
    if (d[0].kind === "changed") expect(d[0].fields).toEqual(expect.arrayContaining(["risk", "deviation"]));
  });

  it("ignores whitespace-only text differences", () => {
    const d = diffClauseSets([cl("IP", "text ")], [cl("IP", "  text")]);
    expect(d).toHaveLength(0);
  });

  it("lines up duplicate clause types by occurrence", () => {
    const from = [cl("OTHER", "a"), cl("OTHER", "b")];
    const to = [cl("OTHER", "a"), cl("OTHER", "B!")];
    const d = diffClauseSets(from, to);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ kind: "changed", key: "OTHER#1" });
  });

  it("empty → some = all added", () => {
    const d = diffClauseSets([], [cl("IP", "x"), cl("PAYMENT", "y")]);
    expect(d.every((c) => c.kind === "added")).toBe(true);
    expect(d).toHaveLength(2);
  });
});

describe("diffCounts", () => {
  it("counts each change kind + unchanged", () => {
    const from = [cl("A", "1"), cl("B", "2"), cl("C", "3")];
    const to = [cl("A", "1"), cl("B", "changed"), cl("D", "new")];
    const changes = diffClauseSets(from, to);
    const counts = diffCounts(changes, from.length);
    expect(counts).toEqual({ added: 1, removed: 1, changed: 1, unchanged: 1 });
  });
});
