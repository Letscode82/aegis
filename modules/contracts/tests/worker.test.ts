import { describe, it, expect } from "vitest";
import { parseDigestRecipients, mergeRecipients, DIGEST_ROLE_NAMES } from "../src/internal/worker";

describe("parseDigestRecipients", () => {
  it("splits on comma / semicolon / whitespace and keeps only addresses", () => {
    expect(parseDigestRecipients("a@x.com, b@x.com;c@x.com d@x.com")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
      "d@x.com",
    ]);
  });
  it("drops non-address tokens and trims", () => {
    expect(parseDigestRecipients("  a@x.com , notanemail ,  b@x.com ")).toEqual(["a@x.com", "b@x.com"]);
  });
  it("is empty for null / empty", () => {
    expect(parseDigestRecipients(null)).toEqual([]);
    expect(parseDigestRecipients("")).toEqual([]);
    expect(parseDigestRecipients(undefined)).toEqual([]);
  });
});

describe("mergeRecipients", () => {
  it("de-duplicates case-insensitively, role emails first", () => {
    expect(mergeRecipients(["GC@x.com", "ops@x.com"], "gc@x.com, extra@x.com")).toEqual([
      "GC@x.com",
      "ops@x.com",
      "extra@x.com",
    ]);
  });
  it("handles no env override", () => {
    expect(mergeRecipients(["a@x.com"], undefined)).toEqual(["a@x.com"]);
  });
  it("handles no role emails", () => {
    expect(mergeRecipients([], "a@x.com;b@x.com")).toEqual(["a@x.com", "b@x.com"]);
  });
});

describe("DIGEST_ROLE_NAMES", () => {
  it("targets leadership roles", () => {
    expect(DIGEST_ROLE_NAMES).toContain("admin");
    expect(DIGEST_ROLE_NAMES).toContain("gc");
    expect(DIGEST_ROLE_NAMES).toContain("legal_ops");
  });
});
