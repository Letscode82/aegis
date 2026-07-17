import { describe, it, expect } from "vitest";
import {
  decisionToAction,
  isFinalDecision,
  tokenUsable,
  hashToken,
  generateRawToken,
  reviewUrl,
} from "../src/internal/review-token";

const NOW = new Date("2026-07-17T00:00:00.000Z");
const future = new Date("2026-08-01T00:00:00.000Z");
const past = new Date("2026-07-01T00:00:00.000Z");

describe("decisionToAction", () => {
  it("maps each decision to its audit action", () => {
    expect(decisionToAction("ACCEPT")).toBe("contract.review.accepted");
    expect(decisionToAction("COUNTER")).toBe("contract.review.countered");
    expect(decisionToAction("COMMENT")).toBe("contract.review.commented");
  });
});

describe("isFinalDecision", () => {
  it("accept/counter are final, comment is not", () => {
    expect(isFinalDecision("ACCEPT")).toBe(true);
    expect(isFinalDecision("COUNTER")).toBe(true);
    expect(isFinalDecision("COMMENT")).toBe(false);
  });
});

describe("tokenUsable", () => {
  it("active + not expired = usable", () => {
    expect(tokenUsable({ status: "ACTIVE", expiresAt: future }, NOW)).toEqual({ ok: true, reason: "ok" });
  });
  it("revoked / used / expired are not usable", () => {
    expect(tokenUsable({ status: "REVOKED", expiresAt: future }, NOW).reason).toBe("revoked");
    expect(tokenUsable({ status: "USED", expiresAt: future }, NOW).reason).toBe("used");
    expect(tokenUsable({ status: "ACTIVE", expiresAt: past }, NOW).reason).toBe("expired");
  });
  it("expiry exactly at now is expired (inclusive)", () => {
    expect(tokenUsable({ status: "ACTIVE", expiresAt: NOW }, NOW).ok).toBe(false);
  });
});

describe("hashToken", () => {
  it("is deterministic and hides the raw token", () => {
    const raw = "demo-token-abc";
    const h = hashToken(raw);
    expect(h).toBe(hashToken(raw));
    expect(h).not.toContain(raw);
    expect(h).toMatch(/^[0-9a-f]{64}$/); // sha-256 hex
  });
  it("different tokens hash differently", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });
});

describe("generateRawToken", () => {
  it("produces a url-safe opaque string", () => {
    const t = generateRawToken();
    expect(t.length).toBeGreaterThanOrEqual(24);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/); // base64url charset
  });
  it("is unique across calls", () => {
    expect(generateRawToken()).not.toBe(generateRawToken());
  });
});

describe("reviewUrl", () => {
  it("builds a /contract-review/<token> path", () => {
    expect(reviewUrl("XYZ")).toMatch(/\/contract-review\/XYZ$/);
  });
});
