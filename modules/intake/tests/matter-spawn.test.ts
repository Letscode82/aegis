/**
 * Intake → Matter spawn (P2b).
 *
 * Pure-helper coverage for `intakeTypeSpawnsMatter`, `deriveMatterTitle`,
 * and `maybeSpawnMatterForApprovedTicket`. The chokepoint integration
 * (saveTicketsV8 calling the helper after the approval audit) is
 * covered by saveTicketsV8 tests; here we exercise the helper in
 * isolation with `@aegis/matter` mocked.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const createMatterMock = vi.fn();
const intakeTicketUpdateMock = vi.fn();
const logAuditMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: { intakeTicket: { update: intakeTicketUpdateMock } },
  logAudit: logAuditMock,
  MatterType: {
    LITIGATION: "LITIGATION",
    TRANSACTIONAL: "TRANSACTIONAL",
    MA: "MA",
    IP: "IP",
    EMPLOYMENT: "EMPLOYMENT",
    REGULATORY: "REGULATORY",
    INVESTIGATION: "INVESTIGATION",
    ADVISORY: "ADVISORY",
    OTHER: "OTHER",
  },
}));
vi.mock("@aegis/matter", () => ({
  createMatter: createMatterMock,
}));

const {
  intakeTypeSpawnsMatter,
  intakeTypeToMatterType,
  deriveMatterTitle,
  maybeSpawnMatterForApprovedTicket,
} = await import("../src/matter-spawn/server");

const actor = {
  id: "u-alex",
  organizationId: "org1",
  email: "alex@x.example",
  name: "Alex Nguyen",
};

beforeEach(() => {
  createMatterMock.mockReset();
  intakeTicketUpdateMock.mockReset().mockResolvedValue({});
  logAuditMock.mockReset().mockResolvedValue(undefined);
});

describe("intakeTypeSpawnsMatter()", () => {
  it.each([
    ["Contract Review", true],
    ["Litigation / Dispute", true],
    ["Employment Issue", true],
    ["Vendor Due Diligence", true],
    ["Regulatory", true],
    ["Trademark Check", true],
    ["Contract Question", false],
    ["IP Question", false],
    ["Privacy Question", false],
    ["NDA Request", false],
    ["Legal Question — General", false],
    ["Other", false],
    ["I'm not sure", false],
    ["", false],
  ])("%s → %s", (type, expected) => {
    expect(intakeTypeSpawnsMatter(type)).toBe(expected);
  });
});

describe("intakeTypeToMatterType()", () => {
  it.each([
    ["Contract Review", "TRANSACTIONAL"],
    ["Litigation / Dispute", "LITIGATION"],
    ["Employment Issue", "EMPLOYMENT"],
    ["Vendor Due Diligence", "TRANSACTIONAL"],
    ["Regulatory", "REGULATORY"],
    ["Trademark Check", "IP"],
  ])("%s → %s", (intakeType, matterType) => {
    expect(intakeTypeToMatterType(intakeType)).toBe(matterType);
  });

  it("returns null for non-mapped types", () => {
    expect(intakeTypeToMatterType("Contract Question")).toBeNull();
  });
});

describe("deriveMatterTitle()", () => {
  it("uses the first sentence of the description", () => {
    expect(
      deriveMatterTitle({
        type: "Contract Review",
        description: "Review the Snowflake MSA. We need this signed by Friday.",
        requesterName: "Alex",
      }),
    ).toBe("Review the Snowflake MSA");
  });

  it("truncates at 80 chars with an ellipsis", () => {
    const title = deriveMatterTitle({
      type: "Contract Review",
      description:
        "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore",
      requesterName: "Alex",
    });
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith("...")).toBe(true);
  });

  it("falls back to type — requester when description is empty", () => {
    expect(
      deriveMatterTitle({
        type: "Employment Issue",
        description: "",
        requesterName: "Lisa Wang",
      }),
    ).toBe("Employment Issue — Lisa Wang");
  });

  it("falls back gracefully when requester is unknown", () => {
    expect(
      deriveMatterTitle({
        type: "Litigation / Dispute",
        description: null,
        requesterName: null,
      }),
    ).toBe("Litigation / Dispute — Unknown requester");
  });
});

describe("maybeSpawnMatterForApprovedTicket()", () => {
  const eligibleTicket = {
    id: "REQ-9001",
    type: "Contract Review",
    description: "Snowflake MSA review needed.",
    matterId: null,
    organizationId: "org1",
    requesterName: "Sarah Johnson",
  };

  it("spawns a Matter for an eligible, unlinked ticket", async () => {
    createMatterMock.mockResolvedValue({
      id: "m-new-1",
      matterNumber: "M-2026-0042",
    });

    const result = await maybeSpawnMatterForApprovedTicket(eligibleTicket, actor);

    expect(createMatterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Snowflake MSA review needed",
        type: "TRANSACTIONAL",
        intakeTicketId: "REQ-9001",
        initialStatus: "OPEN",
      }),
      expect.objectContaining({ id: "u-alex", organizationId: "org1" }),
    );
    expect(intakeTicketUpdateMock).toHaveBeenCalledWith({
      where: { id: "REQ-9001" },
      data: { matterId: "m-new-1" },
    });
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "intake.ticket.matter_spawned",
        resourceId: "REQ-9001",
        afterJson: expect.objectContaining({
          matterId: "m-new-1",
          matterNumber: "M-2026-0042",
        }),
      }),
    );
    expect(result).toEqual({
      matterId: "m-new-1",
      matterNumber: "M-2026-0042",
      matterTitle: "Snowflake MSA review needed",
    });
  });

  it("is idempotent — returns null without side effects when ticket already linked", async () => {
    const linked = { ...eligibleTicket, matterId: "m-existing" };
    const result = await maybeSpawnMatterForApprovedTicket(linked, actor);

    expect(result).toBeNull();
    expect(createMatterMock).not.toHaveBeenCalled();
    expect(intakeTicketUpdateMock).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("returns null for non-spawn intake types (Q&A-shaped)", async () => {
    const result = await maybeSpawnMatterForApprovedTicket(
      { ...eligibleTicket, type: "Privacy Question" },
      actor,
    );
    expect(result).toBeNull();
    expect(createMatterMock).not.toHaveBeenCalled();
  });

  it("uses TRANSACTIONAL for Vendor DD and IP for Trademark Check", async () => {
    createMatterMock.mockResolvedValue({ id: "m1", matterNumber: "M-2026-0001" });
    await maybeSpawnMatterForApprovedTicket(
      { ...eligibleTicket, type: "Vendor Due Diligence" },
      actor,
    );
    expect(createMatterMock.mock.calls[0][0].type).toBe("TRANSACTIONAL");

    createMatterMock.mockResolvedValue({ id: "m2", matterNumber: "M-2026-0002" });
    await maybeSpawnMatterForApprovedTicket(
      { ...eligibleTicket, type: "Trademark Check" },
      actor,
    );
    expect(createMatterMock.mock.calls[1][0].type).toBe("IP");
  });
});
