import { describe, it, expect } from "vitest";
import { contentHash, md5Hash, dedupByHash, deNIST, isKnownSystemHash, KNOWN_SYSTEM_HASHES } from "../src/hashing";

describe("contentHash / md5Hash", () => {
  it("is stable and whitespace-normalized", () => {
    expect(contentHash("the   pricing  model")).toBe(contentHash("the pricing model"));
    expect(md5Hash("a")).toHaveLength(32);
    expect(contentHash("a")).toHaveLength(64);
  });
  it("differs for different content", () => {
    expect(contentHash("a")).not.toBe(contentHash("b"));
  });
});

describe("dedupByHash", () => {
  it("keeps one per hash and lists the duplicates", () => {
    const h1 = contentHash("same"), h2 = contentHash("other");
    const r = dedupByHash([
      { id: "a", hash: h1 },
      { id: "b", hash: h1 },
      { id: "c", hash: h1 },
      { id: "d", hash: h2 },
    ]);
    expect(r.unique.sort()).toEqual(["a", "d"]);
    expect(r.duplicateCount).toBe(2);
    expect(r.groups).toEqual([{ keep: "a", drop: ["b", "c"] }]);
  });
});

describe("deNIST", () => {
  it("removes known system hashes (empty doc is built-in)", () => {
    const empty = contentHash("");
    expect(KNOWN_SYSTEM_HASHES.has(empty)).toBe(true);
    const r = deNIST([{ id: "sys", hash: empty }, { id: "real", hash: contentHash("substance") }]);
    expect(r.removed).toEqual(["sys"]);
    expect(r.kept).toEqual(["real"]);
  });
  it("honours an extra (NSRL) hash set without code change", () => {
    const nsrl = new Set([contentHash("known installer text")]);
    expect(isKnownSystemHash(contentHash("known installer text"), nsrl)).toBe(true);
    const r = deNIST([{ id: "x", hash: contentHash("known installer text") }], nsrl);
    expect(r.removed).toEqual(["x"]);
  });
});
