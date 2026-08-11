import { describe, it, expect } from "vitest";
import { summarizeDigest } from "../src/internal/digest";
import type { DigestCounts } from "../src/internal/digest";

const zero: DigestCounts = { obligationsOverdue: 0, obligationsDue: 0, noticesClosing: 0, expiringSoon: 0, tampered: 0 };

describe("summarizeDigest", () => {
  it("says all clear when nothing is actionable", () => {
    expect(summarizeDigest(zero)).toMatch(/all clear/i);
  });

  it("leads with tampered contracts (highest severity)", () => {
    const s = summarizeDigest({ ...zero, tampered: 2, obligationsOverdue: 1 });
    expect(s.startsWith("2 tampered contracts")).toBe(true);
  });

  it("pluralizes correctly", () => {
    expect(summarizeDigest({ ...zero, obligationsOverdue: 1 })).toContain("1 overdue obligation");
    expect(summarizeDigest({ ...zero, obligationsOverdue: 3 })).toContain("3 overdue obligations");
  });

  it("joins multiple sections with a middot", () => {
    const s = summarizeDigest({ ...zero, tampered: 1, noticesClosing: 2, obligationsDue: 3 });
    expect(s).toContain("1 tampered contract");
    expect(s).toContain("2 renewal notice windows closing");
    expect(s).toContain("3 obligations due soon");
    expect(s.split(" · ")).toHaveLength(3);
  });

  it("omits zero-count sections", () => {
    const s = summarizeDigest({ ...zero, expiringSoon: 1 });
    expect(s).toBe("1 contract expiring soon");
  });
});
