/**
 * Unit tests for the AgentScorecard formatting helpers.
 *
 * `apps/web/src/views/ai-ops/format.js` is a no-React module so we
 * import it directly across packages. Table-driven; each describe is
 * one logical concern.
 */
import { describe, expect, it } from "vitest";

const { formatDuration, formatPercent, formatCount } = await import(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  "../../../apps/web/src/views/ai-ops/format.js" as any
);

const SEC = 1000;
const MIN = 60 * SEC;
const HR = 60 * MIN;
const DAY = 24 * HR;

describe("formatDuration()", () => {
  // The cases the spec called out: zero, minutes, hours, days, and the
  // exact-60-min boundary. Plus a null check so null inputs (no data
  // for the metric) render the em-dash placeholder.
  it.each([
    ["null → em-dash",                 null,         "—"],
    ["zero → '0 sec'",                 0,            "0 sec"],
    ["minutes case",                   96 * SEC,     "1.6 min"],
    ["hours case",                     2.5 * HR,     "2.5 hr"],
    ["days case",                      1.8 * DAY,    "1.8 days"],
    ["exact 60-min boundary → hr",     60 * MIN,     "1.0 hr"],
  ])("%s", (_label, input, expected) => {
    expect(formatDuration(input as number | null)).toBe(expected);
  });

  it("never emits a bare single-letter unit (s / m / h / d)", () => {
    const samples = [0, 30 * SEC, 90 * SEC, 30 * MIN, 5 * HR, 3 * DAY];
    for (const ms of samples) {
      expect(formatDuration(ms)).not.toMatch(/[\d.]+[smhd]$/);
    }
  });
});

describe("formatPercent() + formatCount()", () => {
  it("renders percent with '%' or em-dash for null", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.836)).toBe("84%");
    expect(formatPercent(1)).toBe("100%");
  });

  it("renders counts as bare integers under 1k and 'N.Nk' above", () => {
    expect(formatCount(null)).toBe("—");
    expect(formatCount(42)).toBe("42");
    expect(formatCount(1234)).toBe("1.2k");
  });
});
