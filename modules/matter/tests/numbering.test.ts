import { describe, expect, it } from "vitest";
import { __test__ } from "../src/internal/services/numbering";

const { applyFormat } = __test__;

describe("matter number format expansion", () => {
  const refDate = new Date("2026-04-15T00:00:00Z");

  it("expands {YYYY} {SEQ:n} placeholders", () => {
    expect(applyFormat("M-{YYYY}-{SEQ:4}", "TRANSACTIONAL", 7, refDate)).toBe(
      "M-2026-0007",
    );
  });

  it("expands {YY} two-digit year", () => {
    expect(applyFormat("{YY}-{SEQ:3}", "OTHER", 12, refDate)).toBe("26-012");
  });

  it("expands {TYPE} short code", () => {
    expect(applyFormat("{TYPE}/{SEQ:2}", "LITIGATION", 4, refDate)).toBe(
      "LIT/04",
    );
  });

  it("clamps SEQ width to a sane range", () => {
    expect(applyFormat("X-{SEQ:0}", "OTHER", 5, refDate)).toMatch(/^X-\d+$/);
    expect(applyFormat("X-{SEQ:25}", "OTHER", 5, refDate)).toMatch(/^X-\d{20}$/);
  });

  it("supports formats without SEQ", () => {
    expect(applyFormat("static-{YYYY}", "MA", 1, refDate)).toBe("static-2026");
  });
});
