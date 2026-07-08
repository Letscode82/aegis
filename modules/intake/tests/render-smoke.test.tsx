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
import { ToastProvider } from "@aegis/ui";

vi.mock("@aegis/auth/react", () => ({
  useCurrentUser: () => ({
    user: { id: "u-test", name: "Test User", email: "t@example.com" },
    loading: false,
    error: null,
    has: () => true,
    roleName: "admin",
  }),
}));

const { NewRequestV8, TicketDetailPanel } = (await import("../src/intake/index.jsx" as never)) as {
  NewRequestV8: React.ComponentType<Record<string, unknown>>;
  TicketDetailPanel: React.ComponentType<Record<string, unknown>>;
};
const { AgentsConsoleTab } = (await import("../src/intake/agents-console.jsx" as never)) as {
  AgentsConsoleTab: React.ComponentType<Record<string, unknown>>;
};
const { WorkflowDesignerTab } = (await import("../src/intake/workflow-designer.jsx" as never)) as {
  WorkflowDesignerTab: React.ComponentType<Record<string, unknown>>;
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

describe("admin console render paths (program #6/#1)", () => {
  it("Agents console renders every agent card without errors", () => {
    const html = renderToString(
      React.createElement(AgentsConsoleTab, { canManage: true, settings: {}, toggle: () => {} }),
    );
    expect(html).toContain("Agents");
    expect(html).toContain("NDA"); // at least one agent card
  });

  it("Workflow Designer renders without errors", () => {
    const html = renderToString(
      React.createElement(ToastProvider, null, React.createElement(WorkflowDesignerTab, { canManage: true })),
    );
    expect(html.length).toBeGreaterThan(50);
  });

  it("Cockpit ticket detail renders in both Full and Focus modes (program #7)", () => {
    const ticket = {
      id: "REQ-1", type: "NDA Request", priority: "Medium", _source: "form", from: "Dana", dept: "Ops",
      submitted: "2026-07-08 10:00", desc: "Need a mutual NDA", slaStatus: "On Track", sla: "24 hrs", slaPct: 20,
      aiTriage: { source: "regex", category: "NDA — Standard", riskFlag: "Low", suggestedAssignee: "AI", confidence: 96, similarMatters: 3, routingRule: "RULE-0" },
    };
    for (const compact of [false, true]) {
      const html = renderToString(React.createElement(TicketDetailPanel, { ticket, compact }));
      expect(html).toContain("Need a mutual NDA"); // description always leads
      expect(html.length).toBeGreaterThan(100);
    }
  });
});
