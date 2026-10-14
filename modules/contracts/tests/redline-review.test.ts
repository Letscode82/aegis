import { describe, it, expect } from "vitest";
import {
  groupSegments,
  buildRedline,
  countChanges,
  applyRedline,
  resolveRedlineReview,
  type RedlineOp,
  type ReviewClause,
} from "../src/internal/redline-review";

const change = (ops: RedlineOp[]) => ops.find((o) => o.kind === "change") as Extract<RedlineOp, { kind: "change" }>;
const cl = (type: string, text: string, extra: Partial<ReviewClause> = {}): ReviewClause => ({
  type, text, summary: null, risk: "LOW", deviation: false, ...extra,
});

describe("groupSegments / buildRedline", () => {
  it("returns a single equal op when nothing changed", () => {
    const ops = buildRedline("the cap is $1M", "the cap is $1M");
    expect(countChanges(ops)).toBe(0);
    expect(ops.every((o) => o.kind === "equal")).toBe(true);
  });

  it("pairs a replacement into one change (old → new)", () => {
    const ops = buildRedline("governed by California law", "governed by Delaware law");
    expect(countChanges(ops)).toBe(1);
    expect(change(ops).del).toMatch(/California/);
    expect(change(ops).ins).toMatch(/Delaware/);
  });

  it("captures a pure insertion (del empty) and a pure deletion (ins empty)", () => {
    const ins = buildRedline("term is 2 years", "term is 2 years and renewable");
    expect(change(ins).del).toBe("");
    expect(change(ins).ins).toMatch(/renewable/);
    const del = buildRedline("liability is uncapped and broad", "liability is broad");
    expect(change(del).ins).toBe("");
    expect(change(del).del).toMatch(/uncapped/);
  });

  it("assigns stable sequential ids", () => {
    const ops = buildRedline("a b c d", "a X c Y");
    const ids = ops.filter((o) => o.kind === "change").map((o) => (o as Extract<RedlineOp, { kind: "change" }>).id);
    expect(ids).toEqual([0, 1]);
  });
});

describe("applyRedline", () => {
  const ops = buildRedline("governed by California law", "governed by Delaware law");
  const id = change(ops).id;
  it("defaults undecided to ACCEPT (opt-out)", () => expect(applyRedline(ops, {})).toBe("governed by Delaware law"));
  it("reject keeps the original", () => expect(applyRedline(ops, { [id]: "reject" })).toBe("governed by California law"));
  it("accept keeps the revision", () => expect(applyRedline(ops, { [id]: "accept" })).toBe("governed by Delaware law"));
});

describe("resolveRedlineReview", () => {
  it("accepts every change by default → the `to` clause set", () => {
    const from = [cl("LIABILITY", "cap is $1M"), cl("TERM", "1 year")];
    const to = [cl("LIABILITY", "cap is $5M", { risk: "HIGH", deviation: true }), cl("TERM", "2 years")];
    const out = resolveRedlineReview(from, to, {});
    expect(out.map((c) => c.text)).toEqual(["cap is $5M", "2 years"]);
    // Metadata follows the accepted (revised) text.
    expect(out[0].risk).toBe("HIGH");
    expect(out[0].deviation).toBe(true);
  });

  it("rejecting all text ops reverts a changed clause to `from` text AND metadata", () => {
    const from = [cl("LIABILITY", "cap is $1M")];
    const to = [cl("LIABILITY", "cap is $5M", { risk: "HIGH", deviation: true })];
    // Build the ops to find the change ids, then reject them.
    const ops = buildRedline("cap is $1M", "cap is $5M");
    const textOps = Object.fromEntries(ops.filter((o) => o.kind === "change").map((o) => [(o as Extract<RedlineOp, { kind: "change" }>).id, "reject" as const]));
    const out = resolveRedlineReview(from, to, { "LIABILITY#0": { textOps } });
    expect(out[0].text).toBe("cap is $1M");
    expect(out[0].risk).toBe("LOW"); // metadata snaps back to `from` when text is fully reverted
    expect(out[0].deviation).toBe(false);
  });

  it("keeps a removed clause when the removal is rejected; drops it on accept (default)", () => {
    const from = [cl("INDEMNITY", "broad indemnity"), cl("TERM", "1 year")];
    const to = [cl("TERM", "1 year")];
    expect(resolveRedlineReview(from, to, {}).map((c) => c.type)).toEqual(["TERM"]); // default accepts the removal
    const kept = resolveRedlineReview(from, to, { "INDEMNITY#0": { clause: "reject" } });
    expect(kept.map((c) => c.type)).toEqual(["INDEMNITY", "TERM"]); // from-order spine preserved
  });

  it("keeps an added clause by default; drops it when rejected", () => {
    const from = [cl("TERM", "1 year")];
    const to = [cl("TERM", "1 year"), cl("ARBITRATION", "AAA rules")];
    expect(resolveRedlineReview(from, to, {}).map((c) => c.type)).toEqual(["TERM", "ARBITRATION"]);
    expect(resolveRedlineReview(from, to, { "ARBITRATION#0": { clause: "reject" } }).map((c) => c.type)).toEqual(["TERM"]);
  });

  it("resolves a metadata-only change via a single clause verdict", () => {
    const from = [cl("CONFIDENTIALITY", "same text", { risk: "LOW" })];
    const to = [cl("CONFIDENTIALITY", "same text", { risk: "HIGH", deviation: true })];
    expect(resolveRedlineReview(from, to, {})[0].risk).toBe("HIGH"); // default accept
    expect(resolveRedlineReview(from, to, { "CONFIDENTIALITY#0": { clause: "reject" } })[0].risk).toBe("LOW");
  });

  it("round-trips: reject everything → exactly `from`; accept everything → exactly `to`", () => {
    const from = [cl("LIABILITY", "cap is $1M"), cl("INDEMNITY", "broad"), cl("TERM", "1 year")];
    const to = [cl("LIABILITY", "cap is $5M"), cl("TERM", "1 year"), cl("ARBITRATION", "AAA rules")];
    // accept-all (default) == to
    expect(resolveRedlineReview(from, to, {}).map((c) => [c.type, c.text])).toEqual(to.map((c) => [c.type, c.text]));
    // reject-all == from
    const rejectAll: Record<string, { textOps?: Record<number, "reject">; clause?: "reject" }> = {};
    const ops = buildRedline("cap is $1M", "cap is $5M");
    rejectAll["LIABILITY#0"] = { textOps: Object.fromEntries(ops.filter((o) => o.kind === "change").map((o) => [(o as Extract<RedlineOp, { kind: "change" }>).id, "reject"])) };
    rejectAll["INDEMNITY#0"] = { clause: "reject" }; // keep our removed clause
    rejectAll["ARBITRATION#0"] = { clause: "reject" }; // drop their added clause
    const back = resolveRedlineReview(from, to, rejectAll);
    expect(back.map((c) => [c.type, c.text])).toEqual(from.map((c) => [c.type, c.text]));
  });
});
