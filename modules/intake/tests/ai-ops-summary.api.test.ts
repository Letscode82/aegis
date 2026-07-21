/**
 * API handler tests for GET /api/ai-ops/summary.
 *
 * The handler lives in apps/web/pages/api/ai-ops/summary.ts. We import
 * it via the cross-package relative path — vitest resolves TS through
 * its built-in transformer.
 *
 * Mocking strategy:
 *   - `@aegis/db` is mocked at the module boundary so `prisma.user.findFirst`
 *     returns whatever AuthUser shape the test wants. This lets the real
 *     `getResolvedUser` → `resolveByEmail` chain run, exercising the actual
 *     permission-gate code (`requireActorAny` → `assertUserCanDo`) end-to-end.
 *   - `@aegis/intake/ai-ops` is mocked so we don't re-test the summary
 *     service's contents here; just the handler's plumbing.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";

// ── Mocks ────────────────────────────────────────────────────────────

const userFindFirstMock = vi.fn();
vi.mock("@aegis/db", () => ({
  prisma: {
    user: { findFirst: userFindFirstMock },
  },
}));

const getAIOperationsSummaryMock = vi.fn();
vi.mock("@aegis/intake/ai-ops", () => ({
  getAIOperationsSummary: getAIOperationsSummaryMock,
}));

// Import the handler AFTER mocks are registered.
const { default: handler } = await import(
  "../../../apps/web/pages/api/ai-ops/summary"
);

// ── Test helpers ─────────────────────────────────────────────────────

function makeReq(method = "GET"): NextApiRequest {
  return { method, query: {}, headers: {} } as unknown as NextApiRequest;
}

interface FakeRes {
  status(code: number): FakeRes;
  json(data: unknown): FakeRes;
  setHeader(k: string, v: string): void;
  _status: number;
  _json: unknown;
  _headers: Record<string, string>;
}

function makeRes(): FakeRes & NextApiResponse {
  const r: FakeRes = {
    _status: 0,
    _json: undefined,
    _headers: {},
    status(code) {
      this._status = code;
      return this;
    },
    json(data) {
      this._json = data;
      return this;
    },
    setHeader(k, v) {
      this._headers[k] = v;
    },
  };
  return r as unknown as FakeRes & NextApiResponse;
}

/** Fake DB row in the shape `resolveByEmail()` expects.
 *
 * Uses a NON-admin canonical role (`legal_ops`) as the carrier so the exact
 * `permissions` array under test is honored verbatim. `admin` can't be used
 * here: it's the superuser bundle by invariant, so `assembleAuthUser`
 * resolves it from code (the full Permission enum) regardless of the stored
 * list — which would defeat a test that supplies a deliberately-narrow set. */
function fakeDbUser(permissions: string[]) {
  return {
    id: "u1",
    organizationId: "org1",
    email: "casey.ops@aegis-demo.example",
    name: "Casey Ops",
    suspendedAt: null,
    role: {
      id: "r-legal-ops",
      name: "legal_ops",
      permissions, // Role.permissions is Json — array of strings works.
    },
    organization: { id: "org1", name: "AEGIS Demo" },
  };
}

const FAKE_SUMMARY = {
  activity: [],
  scorecard: {
    accuracy: null,
    coverage: null,
    avgReviewTimeMs: null,
    escalationRate: null,
    agentEvents: 0,
  },
  pendingReview: [],
  asOf: "2026-05-13T12:00:00.000Z",
};

beforeEach(() => {
  userFindFirstMock.mockReset();
  getAIOperationsSummaryMock.mockReset();
  getAIOperationsSummaryMock.mockResolvedValue(FAKE_SUMMARY);
});

// ── Tests ────────────────────────────────────────────────────────────

describe("GET /api/ai-ops/summary", () => {
  it("405s on non-GET methods", async () => {
    const req = makeReq("POST");
    const res = makeRes();
    await handler(req, res);
    expect((res as unknown as FakeRes)._status).toBe(405);
    expect((res as unknown as FakeRes)._headers.Allow).toBe("GET");
  });

  it("401s when no user is resolved from the session", async () => {
    userFindFirstMock.mockResolvedValueOnce(null);
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect((res as unknown as FakeRes)._status).toBe(401);
  });

  it("403s when caller has neither audit:read_all nor intake:read_all_tickets", async () => {
    userFindFirstMock.mockResolvedValueOnce(
      fakeDbUser(["intake:create_ticket"]),
    );
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect((res as unknown as FakeRes)._status).toBe(403);
    expect(getAIOperationsSummaryMock).not.toHaveBeenCalled();
  });

  it("200s with the summary shape when caller has audit:read_all", async () => {
    userFindFirstMock.mockResolvedValueOnce(fakeDbUser(["audit:read_all"]));
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect((res as unknown as FakeRes)._status).toBe(200);
    expect((res as unknown as FakeRes)._json).toEqual(FAKE_SUMMARY);
    expect(getAIOperationsSummaryMock).toHaveBeenCalledWith("org1");
  });

  it("200s with the summary shape when caller has intake:read_all_tickets", async () => {
    userFindFirstMock.mockResolvedValueOnce(
      fakeDbUser(["intake:read_all_tickets"]),
    );
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect((res as unknown as FakeRes)._status).toBe(200);
    expect((res as unknown as FakeRes)._json).toEqual(FAKE_SUMMARY);
  });

  it("500s when the summary service throws", async () => {
    userFindFirstMock.mockResolvedValueOnce(fakeDbUser(["audit:read_all"]));
    getAIOperationsSummaryMock.mockRejectedValueOnce(new Error("db down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect((res as unknown as FakeRes)._status).toBe(500);
    errSpy.mockRestore();
  });
});
