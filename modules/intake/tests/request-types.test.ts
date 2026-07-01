/**
 * Intake request types (Phase 1) — configurable workstreams with
 * structured fields + audited CRUD.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const typeCreate = vi.fn();
const typeFindMany = vi.fn();
const typeFindFirst = vi.fn();
const typeUpdate = vi.fn();
const typeDelete = vi.fn();
const fieldDeleteMany = vi.fn();
const txn = vi.fn();
const logAuditMock = vi.fn();
const getUserMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    intakeRequestType: {
      create: typeCreate,
      findMany: typeFindMany,
      findFirst: typeFindFirst,
      update: typeUpdate,
      delete: typeDelete,
    },
    intakeRequestField: { deleteMany: fieldDeleteMany },
    $transaction: txn,
  },
  logAudit: logAuditMock,
  getCurrentUser: getUserMock,
}));

const {
  listRequestTypes,
  createRequestType,
  updateRequestType,
  deleteRequestType,
  RequestTypeValidationError,
  RequestTypeNotFoundError,
} = await import("../src/request-types/server");

const ROW = (over: Record<string, unknown> = {}) => ({
  id: "rt-1",
  key: "litigation-noncourt",
  name: "Litigation (non-court)",
  workstream: "Litigation",
  description: null,
  active: true,
  stagesJson: ["Intake", "Triage", "Assigned"],
  sortOrder: 100,
  fields: [
    { id: "f1", key: "adverse_party", label: "Adverse party", kind: "text", required: true, sortOrder: 10, optionsJson: [] },
  ],
  ...over,
});

beforeEach(() => {
  typeCreate.mockReset();
  typeFindMany.mockReset().mockResolvedValue([ROW()]);
  typeFindFirst.mockReset();
  typeUpdate.mockReset();
  typeDelete.mockReset().mockResolvedValue({});
  fieldDeleteMany.mockReset().mockResolvedValue({});
  logAuditMock.mockReset().mockResolvedValue("audit-1");
  getUserMock.mockReset().mockResolvedValue({ id: "u-1", name: "Admin" });
  // $transaction runs the callback with a tx exposing the same models.
  txn.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      intakeRequestField: { deleteMany: fieldDeleteMany },
      intakeRequestType: { update: typeUpdate },
    }),
  );
});

describe("request types", () => {
  it("creates a type with fields and writes an audit row", async () => {
    typeCreate.mockResolvedValue(ROW());
    const dto = await createRequestType(
      "org1",
      {
        key: "litigation-noncourt",
        name: "Litigation (non-court)",
        workstream: "Litigation",
        stages: ["Intake", "Triage"],
        fields: [{ key: "adverse_party", label: "Adverse party", kind: "text", required: true, sortOrder: 10, options: [] }],
      },
      {},
    );
    expect(dto.key).toBe("litigation-noncourt");
    expect(dto.fields[0].key).toBe("adverse_party");
    const audit = logAuditMock.mock.calls[0][0];
    expect(audit.action).toBe("intake.request_type.created");
    expect(audit.actorId).toBe("u-1");
    // create nested the fields
    expect(typeCreate.mock.calls[0][0].data.fields.create[0].key).toBe("adverse_party");
  });

  it("rejects an invalid key", async () => {
    await expect(
      createRequestType("org1", { key: "Bad Key!", name: "x" }),
    ).rejects.toBeInstanceOf(RequestTypeValidationError);
    expect(typeCreate).not.toHaveBeenCalled();
  });

  it("rejects a duplicate field key and an invalid kind", async () => {
    await expect(
      createRequestType("org1", {
        key: "t", name: "T",
        fields: [
          { key: "a", label: "A", kind: "text", required: false, sortOrder: 1, options: [] },
          { key: "a", label: "A2", kind: "text", required: false, sortOrder: 2, options: [] },
        ],
      }),
    ).rejects.toThrow(/duplicate field key/i);

    await expect(
      createRequestType("org1", {
        key: "t", name: "T",
        fields: [{ key: "a", label: "A", kind: "bogus", required: false, sortOrder: 1, options: [] }],
      }),
    ).rejects.toThrow(/invalid kind/i);
  });

  it("lists active types with their fields", async () => {
    const list = await listRequestTypes("org1");
    expect(list).toHaveLength(1);
    expect(list[0].fields).toHaveLength(1);
    expect(typeFindMany.mock.calls[0][0].where.active).toBe(true);
  });

  it("updates a type, replacing fields, and audits", async () => {
    typeFindFirst.mockResolvedValue(ROW());
    typeUpdate.mockResolvedValue(ROW({ name: "Renamed", fields: [] }));
    const dto = await updateRequestType("org1", "rt-1", {
      key: "litigation-noncourt",
      name: "Renamed",
      fields: [],
    });
    expect(dto.name).toBe("Renamed");
    expect(fieldDeleteMany).toHaveBeenCalledWith({ where: { requestTypeId: "rt-1" } });
    expect(logAuditMock.mock.calls.some((c) => c[0].action === "intake.request_type.updated")).toBe(true);
  });

  it("404s updating a missing type", async () => {
    typeFindFirst.mockResolvedValue(null);
    await expect(
      updateRequestType("org1", "missing", { key: "k", name: "n" }),
    ).rejects.toBeInstanceOf(RequestTypeNotFoundError);
  });

  it("deletes a type and audits", async () => {
    typeFindFirst.mockResolvedValue({ key: "k", name: "n" });
    await deleteRequestType("org1", "rt-1");
    expect(typeDelete).toHaveBeenCalledWith({ where: { id: "rt-1" } });
    expect(logAuditMock.mock.calls.some((c) => c[0].action === "intake.request_type.deleted")).toBe(true);
  });
});
