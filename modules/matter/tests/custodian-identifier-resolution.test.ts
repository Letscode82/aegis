/**
 * Unit coverage for the custodian-identifier resolution introduced
 * by the "drop unknown sentinel" fix.
 *
 * Part 1: `resolveCustodianExternalIdentifier` (data-sources.ts)
 *   - externalRef wins by precedence
 *   - email is the universal fallback
 *   - both null → fail loud
 *
 * Part 2: `M365GraphDelegatedClient.addCustodian` guard
 *   - non-email input throws upstream of any Graph call
 *   - error message includes the offending value
 */
import { describe, expect, it, vi } from "vitest";

// ─── @aegis/db stub: logAudit must not touch a real Postgres ───────
vi.mock("@aegis/db", () => ({
  logAudit: vi.fn(async () => undefined),
}));

// Delegated-auth stub: addCustodian's guard fires before any token
// fetch in the happy path, but applyPreservation paths could reach
// here — return a stub token so nothing else explodes if exercised.
vi.mock("../src/internal/services/m365-graph-delegated-auth", () => ({
  getFreshDelegatedAccessToken: vi.fn(async () => ({
    accessToken: "stub-token",
    expiresAt: new Date(Date.now() + 60_000),
  })),
}));

import { resolveCustodianExternalIdentifier } from "../src/internal/legal-hold/services/data-sources";
import { M365GraphDelegatedClient } from "../src/internal/services/m365-graph-delegated-client";

describe("resolveCustodianExternalIdentifier", () => {
  const base = { id: "p-1", name: "Sarah Watson" };

  it("returns externalRef when present", () => {
    expect(
      resolveCustodianExternalIdentifier({
        ...base,
        externalRef: "workday:E12345",
        email: null,
      }),
    ).toBe("workday:E12345");
  });

  it("returns email when externalRef is null but email is present", () => {
    expect(
      resolveCustodianExternalIdentifier({
        ...base,
        externalRef: null,
        email: "sarah.watson@6bs6wq.onmicrosoft.com",
      }),
    ).toBe("sarah.watson@6bs6wq.onmicrosoft.com");
  });

  it("returns externalRef even when email is also present (precedence)", () => {
    expect(
      resolveCustodianExternalIdentifier({
        ...base,
        externalRef: "workday:E12345",
        email: "sarah.watson@6bs6wq.onmicrosoft.com",
      }),
    ).toBe("workday:E12345");
  });

  it("throws with a clear message when both externalRef and email are null", () => {
    expect(() =>
      resolveCustodianExternalIdentifier({
        ...base,
        externalRef: null,
        email: null,
      }),
    ).toThrow(/p-1/);
    expect(() =>
      resolveCustodianExternalIdentifier({
        ...base,
        externalRef: null,
        email: null,
      }),
    ).toThrow(/Sarah Watson/);
    expect(() =>
      resolveCustodianExternalIdentifier({
        ...base,
        externalRef: null,
        email: null,
      }),
    ).toThrow(/both externalRef and email are null/);
  });
});

describe("M365GraphDelegatedClient.addCustodian — input guard", () => {
  it("throws when given a non-email string like 'unknown'", async () => {
    const client = new M365GraphDelegatedClient("tenant-x", "org-1");
    // addCustodian is private; access via cast for a focused unit test.
    const addCustodian = (
      client as unknown as {
        addCustodian: (caseId: string, userExternalId: string) => Promise<string>;
      }
    ).addCustodian.bind(client);
    await expect(addCustodian("case-1", "unknown")).rejects.toThrow(
      /must be a UPN \(email format\)/,
    );
  });

  it("error message includes the offending value", async () => {
    const client = new M365GraphDelegatedClient("tenant-x", "org-1");
    const addCustodian = (
      client as unknown as {
        addCustodian: (caseId: string, userExternalId: string) => Promise<string>;
      }
    ).addCustodian.bind(client);
    await expect(addCustodian("case-1", "garbage-id")).rejects.toThrow(
      /"garbage-id"/,
    );
  });
});
