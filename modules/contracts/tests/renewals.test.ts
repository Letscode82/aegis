import { describe, it, expect } from "vitest";
import { classifyRenewalUrgency, inferRenewalTermMonths } from "../src/internal/renewals";
import type { RenewalUrgencyInput } from "../src/internal/renewals";

const NOW = new Date("2026-07-01T00:00:00Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const base: RenewalUrgencyInput = {
  status: "ACTIVE",
  autoRenew: false,
  expiryDate: null,
  noticeWindowDays: null,
  renewalNoticeSentAt: null,
  renewalDecision: "UNDECIDED",
};

describe("classifyRenewalUrgency", () => {
  it("EXPIRED when past expiry", () => {
    expect(classifyRenewalUrgency({ ...base, expiryDate: inDays(-5) }, NOW).urgency).toBe("EXPIRED");
  });

  it("NOTICE_WINDOW_CLOSING — auto-renew, deadline imminent, undecided", () => {
    // expiry in 100d, 90d notice window → deadline in 10d (≤ 30d soon bar).
    const r = classifyRenewalUrgency(
      { ...base, autoRenew: true, expiryDate: inDays(100), noticeWindowDays: 90 },
      NOW,
    );
    expect(r.urgency).toBe("NOTICE_WINDOW_CLOSING");
    expect(r.daysToNoticeDeadline).toBe(10);
  });

  it("NOTICE_WINDOW_MISSED — auto-renew, deadline already passed, still pre-expiry", () => {
    // expiry in 20d, 90d notice window → deadline was 70d ago.
    const r = classifyRenewalUrgency(
      { ...base, autoRenew: true, expiryDate: inDays(20), noticeWindowDays: 90 },
      NOW,
    );
    expect(r.urgency).toBe("NOTICE_WINDOW_MISSED");
  });

  it("a recorded decision suppresses the trap (noticeHandled)", () => {
    const r = classifyRenewalUrgency(
      { ...base, autoRenew: true, expiryDate: inDays(100), noticeWindowDays: 90, renewalDecision: "RENEW" },
      NOW,
    );
    expect(r.noticeHandled).toBe(true);
    expect(r.urgency).not.toBe("NOTICE_WINDOW_CLOSING"); // falls through to expiry bucket
  });

  it("a sent notice also suppresses the trap", () => {
    const r = classifyRenewalUrgency(
      { ...base, autoRenew: true, expiryDate: inDays(100), noticeWindowDays: 90, renewalNoticeSentAt: inDays(-1) },
      NOW,
    );
    expect(r.urgency).not.toBe("NOTICE_WINDOW_CLOSING");
  });

  it("EXPIRING_SOON / UPCOMING / FUTURE by expiry distance (no trap)", () => {
    expect(classifyRenewalUrgency({ ...base, expiryDate: inDays(45) }, NOW).urgency).toBe("EXPIRING_SOON");
    expect(classifyRenewalUrgency({ ...base, expiryDate: inDays(120) }, NOW).urgency).toBe("UPCOMING");
    expect(classifyRenewalUrgency({ ...base, expiryDate: inDays(300) }, NOW).urgency).toBe("FUTURE");
  });

  it("no expiry → FUTURE, null distances", () => {
    const r = classifyRenewalUrgency(base, NOW);
    expect(r.urgency).toBe("FUTURE");
    expect(r.daysToExpiry).toBeNull();
    expect(r.noticeDeadline).toBeNull();
  });

  it("honors custom horizons", () => {
    const r = classifyRenewalUrgency(
      { ...base, autoRenew: true, expiryDate: inDays(100), noticeWindowDays: 90 },
      NOW,
      { noticeSoonDays: 5 },
    );
    // deadline in 10d but soon bar is 5d → not "closing" yet.
    expect(r.urgency).not.toBe("NOTICE_WINDOW_CLOSING");
  });
});

describe("inferRenewalTermMonths", () => {
  it("computes the current term length in months", () => {
    expect(inferRenewalTermMonths(new Date("2025-01-01"), new Date("2026-01-01"))).toBe(12);
    expect(inferRenewalTermMonths(new Date("2026-01-01"), new Date("2026-07-01"))).toBe(6);
  });
  it("defaults to 12 when a boundary is missing or non-positive", () => {
    expect(inferRenewalTermMonths(null, new Date("2026-01-01"))).toBe(12);
    expect(inferRenewalTermMonths(new Date("2026-01-01"), new Date("2026-01-01"))).toBe(12);
  });
});
