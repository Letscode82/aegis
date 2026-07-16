/**
 * Regression: parseJSONLoose must tolerate a model emitting a multi-line
 * string value with LITERAL newlines (invalid JSON) — the single most
 * common reason a Claude-backed agent (NDA, contract, notice) degraded to
 * "AI unavailable" while shorter-answer agents (FAQ) worked. The parser
 * repairs bare control chars inside strings and still parses.
 */
import { describe, it, expect } from "vitest";
import { parseJSONLoose } from "@aegis/ai";

describe("parseJSONLoose — tolerates model JSON with unescaped newlines", () => {
  it("repairs a multi-line drafted response (literal newlines in a string)", () => {
    // What a model actually returns for a multi-paragraph NDA draft:
    const raw = '{"draftedResponse":"Hi Harsha,\n\nI\'ve drafted a Standard Mutual NDA:\n\n• 2-year term\n• Delaware law\n\n— AEGIS Legal","confidence":0.9,"concerns":[]}';
    // Sanity: this is NOT valid JSON as-is.
    expect(() => JSON.parse(raw)).toThrow();
    const parsed = parseJSONLoose(raw);
    expect(parsed.confidence).toBe(0.9);
    expect(parsed.draftedResponse).toContain("Standard Mutual NDA");
    expect(parsed.draftedResponse).toContain("Delaware law");
  });

  it("still parses clean JSON, and strips ```json fences + prose", () => {
    expect(parseJSONLoose('{"a":1}').a).toBe(1);
    expect(parseJSONLoose('```json\n{"a":2}\n```').a).toBe(2);
    expect(parseJSONLoose('Here you go: {"a":3} thanks').a).toBe(3);
  });

  it("does not corrupt already-escaped newlines", () => {
    const parsed = parseJSONLoose('{"s":"line1\\nline2"}');
    expect(parsed.s).toBe("line1\nline2");
  });
});
