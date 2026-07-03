/**
 * W3-1 (Teams intake channel, issue #113) — protocol layer + dispatch.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("@aegis/db", () => ({
  prisma: {
    intakeTicket: {
      findFirst: vi.fn().mockResolvedValue({
        id: "REQ-1001",
        status: "IN_REVIEW",
        stage: "review",
        priority: "High",
        assignedTo: "Maya Chen",
        slaStatus: "On Track",
        description: "Mutual NDA with Acme Robotics for the Q3 pilot program",
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
  IntakeSource: { FORM: "FORM", EMAIL: "EMAIL", SLACK: "SLACK", API: "API", COPILOT: "COPILOT", TEAMS: "TEAMS" },
  getCurrentOrganization: vi.fn().mockResolvedValue({ id: "org1" }),
}));

const {
  verifyTeamsHmac,
  stripMentions,
  parseTeamsCommand,
  subjectFromText,
} = await import("../src/teams-channel/protocol");
const { handleTeamsActivity } = await import("../src/teams-channel/server");
const { prisma } = await import("@aegis/db");

const SECRET = Buffer.from("super-secret-teams-token").toString("base64");

function sign(body: string, secretBase64 = SECRET): string {
  const digest = createHmac("sha256", Buffer.from(secretBase64, "base64"))
    .update(Buffer.from(body, "utf8"))
    .digest("base64");
  return `HMAC ${digest}`;
}

describe("verifyTeamsHmac", () => {
  const body = '{"type":"message","text":"hello"}';

  it("accepts a correctly signed body", () => {
    expect(
      verifyTeamsHmac({ rawBody: body, authHeader: sign(body), secretBase64: SECRET }),
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(
      verifyTeamsHmac({
        rawBody: body.replace("hello", "hacked"),
        authHeader: sign(body),
        secretBase64: SECRET,
      }),
    ).toBe(false);
  });

  it("rejects a signature from the wrong secret", () => {
    const other = Buffer.from("wrong-token").toString("base64");
    expect(
      verifyTeamsHmac({ rawBody: body, authHeader: sign(body, other), secretBase64: SECRET }),
    ).toBe(false);
  });

  it("rejects missing / malformed auth headers", () => {
    expect(verifyTeamsHmac({ rawBody: body, authHeader: null, secretBase64: SECRET })).toBe(false);
    expect(verifyTeamsHmac({ rawBody: body, authHeader: "Bearer xyz", secretBase64: SECRET })).toBe(false);
    expect(verifyTeamsHmac({ rawBody: body, authHeader: "HMAC ", secretBase64: SECRET })).toBe(false);
  });
});

describe("mention stripping + command parsing", () => {
  it("strips <at> mentions and html", () => {
    expect(stripMentions("<at>AEGIS</at> We need an NDA &amp; a DPA")).toBe(
      "We need an NDA & a DPA",
    );
  });

  it("parses help / status / file commands", () => {
    expect(parseTeamsCommand("<at>AEGIS</at> help")).toEqual({ kind: "help" });
    expect(parseTeamsCommand("<at>AEGIS</at>")).toEqual({ kind: "help" });
    expect(parseTeamsCommand("<at>AEGIS</at> status REQ-1001")).toEqual({
      kind: "status",
      ticketId: "REQ-1001",
    });
    expect(parseTeamsCommand("<at>AEGIS</at> STATUS")).toEqual({
      kind: "status",
      ticketId: null,
    });
    expect(parseTeamsCommand("<at>AEGIS</at> We need an NDA with Acme")).toEqual({
      kind: "file",
      text: "We need an NDA with Acme",
    });
  });

  it("clips the subject to the first line", () => {
    expect(subjectFromText("Need an NDA\nWith details below")).toBe("Need an NDA");
    expect(subjectFromText("x".repeat(100)).length).toBe(80);
  });
});

describe("handleTeamsActivity — dispatch", () => {
  it("files a ticket through the shared ingest with source TEAMS", async () => {
    const ingest = vi.fn().mockResolvedValue({
      ticketId: "tkt-teams-1",
      requesterId: "p-1",
      classified: true,
      type: "NDA Request",
      priority: "Medium",
      slaHours: 8,
      assignedTo: "Maya Chen",
      firedRuleIds: [],
    });
    const reply = await handleTeamsActivity(
      {
        type: "message",
        id: "msg-42",
        from: { name: "Dana Lee" },
        conversation: { id: "conv-9" },
        channelData: { team: { name: "Sales" }, channel: { name: "General" } },
        text: "<at>AEGIS</at> We need a mutual NDA with Acme Robotics",
      },
      { organizationId: "org1", ingest },
    );
    expect(ingest).toHaveBeenCalledTimes(1);
    const [email, opts] = ingest.mock.calls[0];
    expect(email).toMatchObject({
      from: "Dana Lee",
      subject: "We need a mutual NDA with Acme Robotics",
      threadId: "conv-9",
      messageId: "teams:msg-42",
    });
    expect(email.body).toContain("[Filed from Teams: Sales › General]");
    expect(opts).toMatchObject({ organizationId: "org1", source: "TEAMS" });
    expect(reply.type).toBe("message");
    expect(reply.text).toContain("tkt-teams-1");
    expect(reply.text).toContain("NDA Request");
  });

  it("answers a status query without filing", async () => {
    const ingest = vi.fn();
    const reply = await handleTeamsActivity(
      {
        type: "message",
        from: { name: "Dana Lee" },
        text: "<at>AEGIS</at> status REQ-1001",
      },
      { organizationId: "org1", ingest },
    );
    expect(ingest).not.toHaveBeenCalled();
    expect(reply.text).toContain("REQ-1001");
    expect(reply.text).toContain("IN_REVIEW");
    expect(reply.text).toContain("Maya Chen");
  });

  it("reports an unknown ticket id gracefully", async () => {
    (prisma.intakeTicket.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const reply = await handleTeamsActivity(
      { type: "message", from: { name: "Dana" }, text: "<at>AEGIS</at> status NOPE-1" },
      { organizationId: "org1" },
    );
    expect(reply.text).toContain("NOPE-1");
    expect(reply.text.toLowerCase()).toContain("couldn't find");
  });

  it("replies with help for a bare mention", async () => {
    const reply = await handleTeamsActivity(
      { type: "message", from: { name: "Dana" }, text: "<at>AEGIS</at>" },
      { organizationId: "org1" },
    );
    expect(reply.text).toContain("file and track legal requests");
  });

  it("returns a friendly error reply when ingest throws", async () => {
    const ingest = vi.fn().mockRejectedValue(new Error("db down"));
    const reply = await handleTeamsActivity(
      { type: "message", from: { name: "Dana" }, text: "<at>AEGIS</at> file this" },
      { organizationId: "org1", ingest },
    );
    expect(reply.type).toBe("message");
    expect(reply.text.toLowerCase()).toContain("something went wrong");
  });

  it("marks a deduped redelivery instead of double-filing", async () => {
    const ingest = vi.fn().mockResolvedValue({
      ticketId: "tkt-teams-1",
      requesterId: "p-1",
      classified: false,
      type: "NDA Request",
      priority: "Medium",
      slaHours: 8,
      assignedTo: null,
      firedRuleIds: [],
      deduped: true,
    });
    const reply = await handleTeamsActivity(
      { type: "message", id: "msg-42", from: { name: "Dana" }, text: "<at>AEGIS</at> NDA please" },
      { organizationId: "org1", ingest },
    );
    expect(reply.text).toContain("already filed");
  });
});
