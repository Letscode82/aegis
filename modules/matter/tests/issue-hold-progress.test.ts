/**
 * Sub-PR 4d.0 — issue-hold-progress orchestrator + retry service tests.
 *
 * The orchestrator composes existing services; we don't re-test
 * those, just confirm the event stream shape matches the contract
 * the SSE endpoint depends on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  IssueProgressEvent,
  IssueWithProgressInput,
} from "../src/internal/legal-hold/services/issue-hold-progress";

interface FakeDS {
  id: string;
  displayLabel: string;
  preservationStatus: "NOT_REQUESTED" | "PENDING" | "ON_HOLD" | "ERROR" | "RELEASED";
  preservationFailureReason: string | null;
  preservationAppliedAt: Date | null;
}

interface FakeCustodian {
  id: string;
  legalHoldId: string;
  personId: string;
  person: { id: string; name: string; email: string };
  dataSources: FakeDS[];
}

const FAKE = {
  hold: { id: "lh-fixture", organizationId: "org-1", status: "DRAFT" },
  custodians: [] as FakeCustodian[],
  dataSources: new Map<string, FakeDS>(),
};

function resetDb(): void {
  FAKE.hold.status = "DRAFT";
  FAKE.custodians = [
    {
      id: "c1",
      legalHoldId: "lh-fixture",
      personId: "p1",
      person: { id: "p1", name: "Marcus Reid", email: "marcus@example.com" },
      dataSources: [
        {
          id: "ds1",
          displayLabel: "Mailbox",
          preservationStatus: "NOT_REQUESTED",
          preservationFailureReason: null,
          preservationAppliedAt: null,
        },
        {
          id: "ds2",
          displayLabel: "OneDrive",
          preservationStatus: "NOT_REQUESTED",
          preservationFailureReason: null,
          preservationAppliedAt: null,
        },
      ],
    },
  ];
  FAKE.dataSources = new Map();
  for (const c of FAKE.custodians) for (const d of c.dataSources) FAKE.dataSources.set(d.id, d);
}

vi.mock("@aegis/db", () => ({
  prisma: {
    legalHold: {
      findFirst: vi.fn(async () => ({
        id: FAKE.hold.id,
        organizationId: FAKE.hold.organizationId,
        status: FAKE.hold.status,
      })),
    },
    legalHoldCustodian: {
      findMany: vi.fn(async () => FAKE.custodians),
      count: vi.fn(async () => FAKE.custodians.length),
    },
    custodianDataSource: {
      findMany: vi.fn(async () =>
        Array.from(FAKE.dataSources.values()).map((d) => ({
          preservationStatus: d.preservationStatus,
        })),
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const ds = FAKE.dataSources.get(where.id);
        if (!ds) return null;
        return {
          ...ds,
          preservationAction: "LEGAL_HOLD_IN_PLACE",
          metadataJson: null,
          legalHoldCustodian: {
            legalHoldId: "lh-fixture",
            legalHold: { organizationId: "org-1" },
            person: { externalRef: "marcus@example.com" },
          },
        };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeDS> }) => {
        const ds = FAKE.dataSources.get(where.id);
        if (ds) Object.assign(ds, data);
        return ds!;
      }),
    },
    holdNoticeIssuance: {
      aggregate: vi.fn(async () => ({ _sum: { recipientCount: 1 } })),
    },
  },
  logAudit: vi.fn(async () => undefined),
}));

// Stub the underlying services — we're testing the generator's event
// shape, not the services themselves (those have their own tests).
vi.mock("../src/internal/legal-hold/services/lifecycle", () => ({
  issueLegalHoldService: vi.fn(async () => {
    FAKE.hold.status = "ISSUED";
    return { id: FAKE.hold.id, status: "ISSUED" };
  }),
}));

vi.mock("../src/internal/legal-hold/services/data-sources", () => ({
  applyDataSourcePreservationService: vi.fn(async ({ dataSourceId }: { dataSourceId: string }) => {
    const ds = FAKE.dataSources.get(dataSourceId);
    if (!ds) throw new Error("not found");
    // First DS succeeds, second one fails — exercises both paths.
    if (dataSourceId === "ds2") {
      ds.preservationStatus = "ERROR";
      ds.preservationFailureReason = "Simulated failure";
    } else {
      ds.preservationStatus = "PENDING";
    }
    return { ...ds, metadataJson: null };
  }),
}));

vi.mock("../src/internal/legal-hold/services/notice-composer", () => ({
  composeAndSendNoticeService: vi.fn(async () => ({
    issuance: { id: "issuance-1" },
    recipientCount: 1,
    deliveryStubbed: true,
  })),
}));

import {
  getIssueStatusSnapshot,
  issueHoldWithProgress,
} from "../src/internal/legal-hold/services/issue-hold-progress";
import {
  DataSourceNotInErrorStateError,
  retryDataSourcePreservationService,
} from "../src/internal/legal-hold/services/retry-data-source";

beforeEach(() => resetDb());
afterEach(() => vi.clearAllMocks());

describe("issueHoldWithProgress", () => {
  it("emits the expected event sequence including a per-source failure", async () => {
    const input: IssueWithProgressInput = {
      holdId: "lh-fixture",
      noticeTemplateId: "tpl-1",
      recipientCustodianPersonIds: ["p1"],
      pushToMicrosoft: true,
    };
    const events: IssueProgressEvent[] = [];
    for await (const ev of issueHoldWithProgress(input, {
      id: "u-admin",
      organizationId: "org-1",
    })) {
      events.push(ev);
    }
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("step_started");
    // First two steps succeed (hold-record, custodians).
    const firstStarted = events.find(
      (e): e is Extract<IssueProgressEvent, { type: "step_started" }> =>
        e.type === "step_started",
    );
    expect(firstStarted?.id).toBe("issue.hold-record");

    // ds2 emits step_failed.
    const ds2Failure = events.find(
      (e): e is Extract<IssueProgressEvent, { type: "step_failed" }> =>
        e.type === "step_failed" && e.id.endsWith("ds:ds2"),
    );
    expect(ds2Failure).toBeTruthy();
    expect(ds2Failure?.error.code).toBe("PRESERVATION_FAILED");

    // Final event is `complete` summarising counts.
    const last = events[events.length - 1]!;
    expect(last.type).toBe("complete");
    if (last.type === "complete") {
      expect(last.summary.totalCustodians).toBe(1);
      expect(last.summary.totalDataSources).toBe(2);
      expect(last.summary.preservedCount).toBe(1);
      expect(last.summary.failedCount).toBe(1);
      expect(last.summary.noticesSent).toBe(1);
    }
  });

  it("skips the Microsoft push when pushToMicrosoft=false", async () => {
    const events: IssueProgressEvent[] = [];
    for await (const ev of issueHoldWithProgress(
      {
        holdId: "lh-fixture",
        noticeTemplateId: "tpl-1",
        recipientCustodianPersonIds: ["p1"],
        pushToMicrosoft: false,
      },
      { id: "u-admin", organizationId: "org-1" },
    )) {
      events.push(ev);
    }
    const purviewSteps = events.filter(
      (e) => "id" in e && e.id?.startsWith("issue.purview"),
    );
    expect(purviewSteps).toHaveLength(0);
    const last = events[events.length - 1]!;
    expect(last.type).toBe("complete");
  });
});

describe("getIssueStatusSnapshot", () => {
  it("aggregates persisted state into a single snapshot", async () => {
    FAKE.dataSources.get("ds1")!.preservationStatus = "ON_HOLD";
    FAKE.dataSources.get("ds2")!.preservationStatus = "ERROR";
    const snap = await getIssueStatusSnapshot("lh-fixture", "org-1");
    expect(snap.totalCustodians).toBe(1);
    expect(snap.totalDataSources).toBe(2);
    expect(snap.onHoldCount).toBe(1);
    expect(snap.errorCount).toBe(1);
    expect(snap.pendingCount).toBe(0);
    expect(snap.noticesSent).toBe(1);
  });
});

describe("retryDataSourcePreservation", () => {
  it("flips PENDING then re-runs apply when current status is ERROR", async () => {
    FAKE.dataSources.get("ds1")!.preservationStatus = "ERROR";
    FAKE.dataSources.get("ds1")!.preservationFailureReason = "old reason";
    const result = await retryDataSourcePreservationService(
      { dataSourceId: "ds1" },
      { id: "u-admin", organizationId: "org-1" },
    );
    // Apply mock flips ds1 to PENDING.
    expect(result.preservationStatus).toBe("PENDING");
  });

  it("refuses with a typed error when source is not in ERROR state", async () => {
    FAKE.dataSources.get("ds1")!.preservationStatus = "ON_HOLD";
    await expect(
      retryDataSourcePreservationService(
        { dataSourceId: "ds1" },
        { id: "u-admin", organizationId: "org-1" },
      ),
    ).rejects.toBeInstanceOf(DataSourceNotInErrorStateError);
  });

  it("refuses cross-org access", async () => {
    FAKE.dataSources.get("ds1")!.preservationStatus = "ERROR";
    await expect(
      retryDataSourcePreservationService(
        { dataSourceId: "ds1" },
        { id: "u-admin", organizationId: "WRONG-ORG" },
      ),
    ).rejects.toThrow(/Cross-org/);
  });
});
