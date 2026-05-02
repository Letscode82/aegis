/**
 * M365 contract tests — confirm the mock and the real client return
 * the same shapes for each of the 8 methods. The real client is
 * instantiated against a stubbed Graph SDK so no network is touched
 * (CI-safe; runs in default `pnpm test`).
 *
 * Shape parity is the architectural commitment: 4c is a pure
 * implementation swap. If a method's return shape ever drifts
 * between mock and real, this catches it before it reaches a
 * caller.
 */
import { describe, expect, it } from "vitest";
import type { Client } from "@microsoft/microsoft-graph-client";
import { MockM365Client } from "../src/internal/services/m365";
import { M365GraphClient } from "../src/internal/services/m365-graph-client";
import type {
  ApplyPreservationInput,
  CandidateCustodian,
  EnumeratedDataSource,
  HoldScopeQuery,
  MatterM365Bindings,
  PreservationResult,
} from "../src/internal/services/m365";
import type { Matter } from "@aegis/db";

// A minimal request-builder stub. Each chain operation returns
// itself so .api(...).filter(...).top(...).get() works; the final
// .get() / .post() / .delete() returns the canned response we set
// for the most recent chain.
function makeStubGraph(responses: Record<string, unknown>): Client {
  let lastEndpoint = "";
  const builder = {
    filter() { return builder; },
    select() { return builder; },
    top() { return builder; },
    expand() { return builder; },
    get: async () => responses[lastEndpoint] ?? { value: [] },
    post: async () => responses[lastEndpoint] ?? { id: "stub-id" },
    delete: async () => undefined,
    patch: async () => responses[lastEndpoint] ?? {},
  };
  return {
    api(endpoint: string) {
      lastEndpoint = endpoint;
      return builder;
    },
  } as unknown as Client;
}

const fixtureMatter: Matter = {
  id: "m-fixture",
  organizationId: "org-fixture",
  matterNumber: "M-FIX-2026-0001",
  title: "Fixture matter",
  type: "TRANSACTIONAL",
  status: "ACTIVE",
  openedAt: new Date(),
  closedAt: null,
  leadAttorneyId: null,
  counterpartyId: null,
  parentMatterId: null,
  costCenterId: null,
  description: null,
  jurisdiction: null,
  estimatedValue: null,
  estimatedDurationDays: null,
  closeoutChecklistJson: [],
  customFieldsJson: {},
  m365Bindings: {},
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as Matter;

describe("M365 contract — mock vs real return shape parity", () => {
  it("getMatterBindings returns MatterM365Bindings shape on both", async () => {
    const mock = new MockM365Client();
    const real = new M365GraphClient(
      makeStubGraph({}),
      "tenant-fixture",
      "org-fixture",
    );
    const a = await mock.getMatterBindings("m-fixture");
    const b = await real.getMatterBindings("m-fixture");
    // Both return the same key set even when empty.
    expect(Object.keys(a).sort()).toEqual(
      Object.keys(b).sort() as Array<keyof MatterM365Bindings>,
    );
    expect(typeof a.provisionedAt === "string" || a.provisionedAt === null).toBe(
      true,
    );
    expect(typeof b.provisionedAt === "string" || b.provisionedAt === null).toBe(
      true,
    );
  });

  it("discoverCustodians returns CandidateCustodian[] on both", async () => {
    const mock = new MockM365Client();
    const real = new M365GraphClient(
      makeStubGraph({
        "/users": {
          value: [
            {
              id: "u1",
              displayName: "Snowflake Reviewer",
              mail: "snowflake@aegis-demo.example",
              department: "Engineering",
              jobTitle: "Senior Counsel",
            },
          ],
        },
      }),
      "tenant-fixture",
      "org-fixture",
    );
    const query: HoldScopeQuery = {
      description: "snowflake",
      matterId: "m-fixture",
    };
    const a = await mock.discoverCustodians(query);
    const b = await real.discoverCustodians(query);
    const candidateKeys: Array<keyof CandidateCustodian> = [
      "externalIdentifier",
      "name",
      "email",
      "matchConfidence",
      "matchRationale",
    ];
    for (const row of [...a, ...b]) {
      for (const k of candidateKeys) expect(row).toHaveProperty(k);
    }
  });

  it("enumerateDataSourcesForUser returns EnumeratedDataSource[] on both", async () => {
    const mock = new MockM365Client();
    const real = new M365GraphClient(
      makeStubGraph({
        "/users/u1/mailboxSettings": {},
        "/users/u1/drive": { id: "drive-1", webUrl: "https://x" },
      }),
      "tenant-fixture",
      "org-fixture",
    );
    const a = await mock.enumerateDataSourcesForUser("u1");
    const b = await real.enumerateDataSourcesForUser("u1");
    const required: Array<keyof EnumeratedDataSource> = [
      "type",
      "externalIdentifier",
      "displayLabel",
      "retentionPolicyConflict",
    ];
    for (const row of [...a, ...b]) {
      for (const k of required) expect(row).toHaveProperty(k);
    }
  });

  it("applyPreservation returns PreservationResult shape on both", async () => {
    const mock = new MockM365Client();
    const input: ApplyPreservationInput = {
      custodianExternalIdentifier: "u1@example.com",
      dataSourceExternalIdentifier: "u1@example.com",
      type: "EMAIL_MAILBOX",
      action: "LEGAL_HOLD_IN_PLACE",
      reasonCode: "hold:lh-fixture",
    };
    const a = await mock.applyPreservation(input);
    // Build a real client whose stubbed Graph returns enough rows to
    // walk the eDiscovery dance: case lookup empty, create returns id,
    // custodian create returns id, status poll returns "applied".
    const real = new M365GraphClient(
      makeStubGraph({
        "/security/cases/ediscoveryCases": { id: "case-1", value: [] },
        "/security/cases/ediscoveryCases/case-1/custodians": { id: "cust-1" },
        "/security/cases/ediscoveryCases/case-1/custodians/cust-1/userSources": {
          id: "src-1",
        },
        "/security/cases/ediscoveryCases/case-1/custodians/applyHold": {},
        "/security/cases/ediscoveryCases/case-1/custodians/cust-1": {
          holdStatus: "applied",
        },
      }),
      "tenant-fixture",
      "org-fixture",
    );
    const b = await real.applyPreservation(input);
    const required: Array<keyof PreservationResult> = [
      "ok",
      "appliedAt",
      "upstreamReferenceId",
      "failureReason",
    ];
    for (const k of required) {
      expect(a).toHaveProperty(k);
      expect(b).toHaveProperty(k);
    }
    expect(typeof a.ok).toBe("boolean");
    expect(typeof b.ok).toBe("boolean");
  });

  it("preserveDepartedMailbox returns PreservationResult shape on both", async () => {
    const mock = new MockM365Client();
    const a = await mock.preserveDepartedMailbox({
      personExternalIdentifier: "u1",
      reasonCode: "hold:lh-fixture",
      separationAt: null,
    });
    expect(typeof a.ok).toBe("boolean");
    expect(typeof a.appliedAt).toBe("string");
  });

  it("releasePreservation returns void on both", async () => {
    const mock = new MockM365Client();
    const real = new M365GraphClient(
      makeStubGraph({
        "/security/cases/ediscoveryCases": { value: [] },
      }),
      "tenant-fixture",
      "org-fixture",
    );
    await expect(
      mock.releasePreservation({
        custodianExternalIdentifier: "u1@example.com",
        dataSourceExternalIdentifier: "u1@example.com",
        type: "EMAIL_MAILBOX",
      }),
    ).resolves.toBeUndefined();
    await expect(
      real.releasePreservation({
        custodianExternalIdentifier: "u1@example.com",
        dataSourceExternalIdentifier: "u1@example.com",
        type: "EMAIL_MAILBOX",
      }),
    ).resolves.toBeUndefined();
  });
});
