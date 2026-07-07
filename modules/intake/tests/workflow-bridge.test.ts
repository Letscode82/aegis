/**
 * W-C — intake ↔ workflow bridge. Ladder starts on ticket creation
 * when the request type binds a workflowKey; best-effort semantics.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const typeFindFirst = vi.fn();
const instanceFindFirst = vi.fn();
const logAuditMock = vi.fn();
const startWorkflowMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    intakeRequestType: { findFirst: typeFindFirst },
    workflowInstance: { findFirst: instanceFindFirst },
  },
  logAudit: logAuditMock,
}));
vi.mock("@aegis/workflow", () => ({ startWorkflow: startWorkflowMock }));

const { maybeStartWorkflowForTicket } = await import("../src/workflow-bridge/server");

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
  logAuditMock.mockReset().mockResolvedValue("a1");
  startWorkflowMock.mockReset().mockResolvedValue({ id: "wf-1" });
});

describe("maybeStartWorkflowForTicket", () => {
  it("starts a ladder when the request type binds a workflowKey, flattening scalar field values", async () => {
    typeFindFirst.mockResolvedValue({ workflowKey: "clm_contract_approval", key: "contracts" });
    const id = await maybeStartWorkflowForTicket("org1", TICKET, "u-1");
    expect(id).toBe("wf-1");
    const call = startWorkflowMock.mock.calls[0][0];
    expect(call.definitionKey).toBe("clm_contract_approval");
    expect(call.entityType).toBe("intake_ticket");
    expect(call.entityId).toBe("REQ-1");
    expect(call.context.contract_value).toBe(5000); // skip rules can bind
    expect(call.context.nested).toBeUndefined(); // scalars only
    expect(call.context.ticket.desc).toBe("MSA review");
  });

  it("no workflowKey → no ladder, no error", async () => {
    typeFindFirst.mockResolvedValue({ workflowKey: null, key: "plain" });
    expect(await maybeStartWorkflowForTicket("org1", TICKET, "u-1")).toBeNull();
    expect(startWorkflowMock).not.toHaveBeenCalled();
  });

  it("falls back to name match when the ticket has no typed requestTypeId", async () => {
    typeFindFirst.mockResolvedValue({ workflowKey: "k", key: "contracts" });
    await maybeStartWorkflowForTicket("org1", { ...TICKET, requestTypeId: null }, "u-1");
    expect(typeFindFirst.mock.calls[0][0].where.name).toBe("Contract Review");
  });

  it("idempotent: an existing instance is returned, not duplicated", async () => {
    typeFindFirst.mockResolvedValue({ workflowKey: "k", key: "contracts" });
    instanceFindFirst.mockResolvedValue({ id: "wf-existing" });
    expect(await maybeStartWorkflowForTicket("org1", TICKET, "u-1")).toBe("wf-existing");
    expect(startWorkflowMock).not.toHaveBeenCalled();
  });

  it("best-effort: a start failure audits as SYSTEM and returns null (ingest survives)", async () => {
    typeFindFirst.mockResolvedValue({ workflowKey: "k", key: "contracts" });
    startWorkflowMock.mockRejectedValue(new Error("no such definition"));
    expect(await maybeStartWorkflowForTicket("org1", TICKET, "u-1")).toBeNull();
    const audit = logAuditMock.mock.calls[0][0];
    expect(audit.action).toBe("intake.ticket.workflow_start_failed");
    expect(audit.actorType).toBe("SYSTEM");
  });
});
