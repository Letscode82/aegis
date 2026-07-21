import { describe, it, expect } from "vitest";
import { normalizeMark, soundex, levenshtein, visualRatio, scoreMark, screenAgainstMarks } from "../src/trademark/similarity";

describe("trademark similarity primitives", () => {
  it("normalizeMark strips to lowercase alphanumerics", () => {
    expect(normalizeMark("Coca-Cola!")).toBe("cocacola");
    expect(normalizeMark("A.B.C 123")).toBe("abc123");
  });

  it("soundex groups sound-alikes", () => {
    expect(soundex("google")).toBe(soundex("googol"));
    expect(soundex("Robert")).toBe(soundex("Rupert"));
    expect(soundex("snowflake")).not.toBe(soundex("orange"));
  });

  it("levenshtein + visualRatio measure edit closeness", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(visualRatio("apple", "apple")).toBe(1);
    expect(visualRatio("apple", "appel")).toBeGreaterThan(0.5);
    expect(visualRatio("apple", "zzzz")).toBeLessThan(0.4);
  });
});

const MARKS = [
  { wordMark: "APPLE", normalizedMark: "apple", niceClasses: [9, 42], status: "LIVE" },
  { wordMark: "SNOWFLAKE", normalizedMark: "snowflake", niceClasses: [9, 42], status: "LIVE" },
  { wordMark: "NIKE", normalizedMark: "nike", niceClasses: [25], status: "LIVE" },
];

describe("scoreMark + screenAgainstMarks", () => {
  it("flags an identical mark as a full conflict", () => {
    const c = scoreMark("apple", soundex("apple"), [9], MARKS[0]);
    expect(c).not.toBeNull();
    expect(c!.basis).toContain("identical");
    expect(c!.score).toBe(1);
  });

  it("flags a near mark (typo — sound-alike / look-alike)", () => {
    const c = scoreMark("appel", soundex("appel"), [9], MARKS[0]);
    expect(c).not.toBeNull();
    expect(c!.basis.length).toBeGreaterThan(0); // phonetic and/or visual
  });

  it("flags a 1-edit look-alike as visual", () => {
    const c = scoreMark("snowflaje", soundex("snowflaje"), [9], MARKS[1]);
    expect(c).not.toBeNull();
    expect(c!.basis).toContain("visual");
  });

  it("no conflict for an unrelated mark", () => {
    expect(scoreMark("zephyrblue", soundex("zephyrblue"), [9], MARKS[0])).toBeNull();
  });

  it("down-weights a conflict in a different NICE class", () => {
    const same = scoreMark("apple", soundex("apple"), [9], MARKS[0])!; // overlapping class
    const diff = scoreMark("apple", soundex("apple"), [25], MARKS[0])!; // no overlap
    expect(diff.classOverlap).toBe(false);
    expect(diff.score).toBeLessThan(same.score);
  });

  it("screenAgainstMarks returns conflicts worst-first", () => {
    const conflicts = screenAgainstMarks("Snowflake", [9], MARKS);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].wordMark).toBe("SNOWFLAKE");
    expect(conflicts[0].score).toBe(1);
  });

  it("no false conflict for a distinctive coined mark", () => {
    expect(screenAgainstMarks("Qwyxlar", [9], MARKS)).toEqual([]);
  });
});
