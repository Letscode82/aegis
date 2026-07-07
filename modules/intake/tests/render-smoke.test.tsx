/**
 * Render smoke (regression for the prod "phone is not defined" crash):
 * server-render the New Request path. renderToString executes the full
 * component render body — exactly where a wrong-scope variable throws —
 * without needing a browser or effects. A ReferenceError anywhere in
 * the render tree fails this test in CI.
 */
import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@aegis/auth/react", () => ({
  useCurrentUser: () => ({
    user: { id: "u-test", name: "Test User", email: "t@example.com" },
    loading: false,
    error: null,
    has: () => true,
    roleName: "admin",
  }),
}));

const { NewRequestV8 } = (await import("../src/intake/index.jsx" as never)) as {
  NewRequestV8: React.ComponentType<Record<string, unknown>>;
};

const store = {
  tickets: [],
  loading: false,
  addTicket: vi.fn(),
  updateTicket: vi.fn(),
  addTicketAndRunAgent: vi.fn(),
  recordTriageAction: vi.fn(),
  bulkApprove: vi.fn(),
  resetToSeed: vi.fn(),
  refresh: vi.fn(),
};

describe("New Request render path", () => {
  it("renders the form (LegacyFormInner) without reference errors", () => {
    // prefillDesc forces mode="form" → LegacyFormInner mounts directly,
    // the exact path that crashed in production.
    const html = renderToString(
      React.createElement(NewRequestV8, {
        store,
        settings: {},
        prefillDesc: "UAT: render smoke",
        goToInbox: () => {},
        goToCockpit: () => {},
        goToMyRequests: () => {},
      }),
    );
    expect(html).toContain("Describe your request");
    expect(html).toContain("Request Type");
  });

  it("renders the picker gate (default mode) without errors", () => {
    const html = renderToString(
      React.createElement(NewRequestV8, {
        store,
        settings: {},
        goToInbox: () => {},
        goToCockpit: () => {},
        goToMyRequests: () => {},
      }),
    );
    expect(html.length).toBeGreaterThan(100);
  });
});
