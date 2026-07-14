/**
 * Intake ↔ workflow bridge. A ladder is assigned on ticket creation —
 * from the request type's explicit binding OR the default-by-type map
 * (deliverables #2), only when a matching definition exists; the agent
 * step (if first) auto-runs. Best-effort semantics throughout.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const typeFindFirst = vi.fn();
const instanceFindFirst = vi.fn();
const definitionFindUnique = vi.fn();
const logAuditMock = vi.fn();
const startWorkflowMock = vi.fn();
const autoRunMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    intakeRequestType: { findFirst: typeFindFirst },
    workflowInstance: { findFirst: instanceFindFirst },
    workflowDefinition: { findUnique: definitionFindUnique },
  },
  logAudit: logAuditMock,
}));
vi.mock("@aegis/workflow", () => ({
  startWorkflow: startWorkflowMock,
  autoRunCurrentAgentStep: autoRunMock,
}));
// Keep the real agent registry out of this unit test.
vi.mock("../src/agents/index.js", () => ({ intakeWorkflowAgentHandler: vi.fn() }));

const { maybeStartWorkflowForTicket, defaultLadderKeyForType } = await import(
  "../src/workflow-bridge/server"
);

const TICKET = {
  id: "REQ-1",
  type: "Contract Review",
  requestTypeId: "rt-1",
  from: "Dana Lee",
  dept: "Ops",
  desc: "MSA review",
  slaHours: 48,
  submittedTs: 1234,
  requestFieldValues: { contract_value: 5000, note: "x", nested: { a: 1 } },
};

beforeEach(() => {
  typeFindFirst.mockReset();
  instanceFindFirst.mockReset().mockResolvedValue(null);
  definitionFindUnique.mockReset().mockResolvedValue({ key: "clm_contract_approval", isActive: true });
  logAuditMock.mockReset().mockResolvedValue("a1");
  startWorkflowMock.mockReset().mockResolvedValue({ id: "wf-1" });
  autoRunMock.mockReset().mockResolvedValue(null);
});

describe("defaultLadderKeyForType", () => {
  it("maps common intake types to seeded library ladders", () => {
    expect(defaultLadderKeyForType("NDA Request")).toBe("nda_fasttrack");
    expect(defaultLadderKeyForType("Contract Review")).toBe("clm_contract_approval");
    expect(defaultLadderKeyForType("Vendor Due Diligence")).toBe("vendor_onboarding");
    expect(defaultLadderKeyForType("Legal Notice")).toBe("legal_notice");
    expect(defaultLadderKeyForType("Employment Issue")).toBe("employment_matter");
    expect(defaultLadderKeyForType("Something Unrelated")).toBeNull();
  });
});

describe("maybeStartWorkflowForTicket", () => {
  it("uses the request type's explicit binding when present, flattening scalar fields", async () => {
    typeFindFirst.mockResolvedValue({ workflowKey: "clm_contract_approval", key: "contracts" });
    const id = await maybeStartWorkflowForTicket("org1", TICKET, "u-1");
    expect(id).toBe("wf-1");
    const call = startWorkflowMock.mock.calls[0][0];
    expect(call.definitionKey).toBe("clm_contract_approval");
    expect(call.context.contract_value).toBe(5000);
    expect(call.context.nested).toBeUndefined();
    expect(call.context.ticket.desc).toBe("MSA review");
    expect(autoRunMock).toHaveBeenCalledWith("wf-1", expect.anything());
  });

  it("AUTO-ASSIGNS by type when there's no explicit binding (deliverables #2)", async () => {
    typeFindFirst.mockResolvedValue({ workflowKey: null, key: "plain" });
    const id = await maybeStartWorkflowForTicket("org1", TICKET, "u-1");
    expect(id).toBe("wf-1");
    expect(startWorkflowMock.mock.calls[0][0].definitionKey).toBe("clm_contract_approval");
  });

  it("does NOT start when the resolved ladder has no definition in the org", async () => {
    typeFindFirst.mockResolvedValue({ workflowKey: null, key: "plain" });
    definitionFindUnique.mockResolvedValue(null); // library not seeded
    expect(await maybeStartWorkflowForTicket("org1", TICKET, "u-1")).toBeNull();
    expect(startWorkflowMock).not.toHaveBeenCalled();
  });

  it("no explicit binding + unmappable type → no ladder", async () => {
    typeFindFirst.mockResolvedValue({ workflowKey: null, key: "plain" });
    expect(await maybeStartWorkflowForTicket("org1", { ...TICKET, type: "Zzz" }, "u-1")).toBeNull();
    expect(startWorkflowMock).not.toHaveBeenCalled();
  });

  it("idempotent: an existing instance is returned, not duplicated", async () => {
    typeFindFirst.mockResolvedValue({ workflowKey: "clm_contract_approval", key: "contracts" });
    instanceFindFirst.mockResolvedValue({ id: "wf-existing" });
    expect(await maybeStartWorkflowForTicket("org1", TICKET, "u-1")).toBe("wf-existing");
    expect(startWorkflowMock).not.toHaveBeenCalled();
  });

  it("best-effort: a start failure audits as SYSTEM and returns null (ingest survives)", async () => {
    typeFindFirst.mockResolvedValue({ workflowKey: "clm_contract_approval", key: "contracts" });
    startWorkflowMock.mockRejectedValue(new Error("boom"));
    expect(await maybeStartWorkflowForTicket("org1", TICKET, "u-1")).toBeNull();
    expect(logAuditMock.mock.calls[0][0].action).toBe("intake.ticket.workflow_start_failed");
    expect(logAuditMock.mock.calls[0][0].actorType).toBe("SYSTEM");
  });
});
