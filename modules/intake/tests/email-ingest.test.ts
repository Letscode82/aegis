/**
 * Email channel ingest (Intake P4a) — an inbound email becomes a real,
 * classified, routed, audited IntakeTicket on the same pipeline as the
 * FORM / COPILOT channels, with no Microsoft Graph dependency.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const personFindFirst = vi.fn();
const personUpsert = vi.fn();
const ticketCreate = vi.fn();
const ruleFindMany = vi.fn();
const ruleUpdateMany = vi.fn();
const logAuditMock = vi.fn();
const getOrgMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    person: { findFirst: personFindFirst, upsert: personUpsert },
    intakeTicket: { create: ticketCreate },
    intakeRoutingRule: { findMany: ruleFindMany, updateMany: ruleUpdateMany },
  },
  logAudit: logAuditMock,
  getCurrentOrganization: getOrgMock,
  IntakeSource: { EMAIL: "EMAIL", FORM: "FORM", COPILOT: "COPILOT" },
  IntakeStatus: { AWAITING_TRIAGE: "AWAITING_TRIAGE" },
}));

// Deterministic classifier: NDA text classifies, everything else doesn't.
vi.mock("@aegis/ai", () => ({
  classifyIntakeRegex: (text: string) =>
    /\bnda\b/i.test(text)
      ? {
          cat: "NDA — Standard",
          priority: "Low",
          team: "AI Auto-Draft",
          sla: "2 hrs",
          slaHours: 2,
          rule: "RULE-0",
          conf: 96,
          risk: "None",
          note: "Auto-draft from playbook template",
          hrs: 0,
          source: "regex",
        }
      : null,
}));

const { ingestInboundEmail, EmailIngestValidationError } = await import(
  "../src/email/server"
);

beforeEach(() => {
  personFindFirst.mockReset().mockResolvedValue(null);
  personUpsert.mockReset().mockResolvedValue({ id: "p-auto-dana-acme-com" });
  ticketCreate.mockReset().mockResolvedValue({});
  ruleFindMany.mockReset().mockResolvedValue([]); // no routing rules by default
  ruleUpdateMany.mockReset().mockResolvedValue({});
  logAuditMock.mockReset().mockResolvedValue("audit-1");
  getOrgMock.mockReset().mockResolvedValue({ id: "org1" });
});

describe("ingestInboundEmail()", () => {
  it("rejects an email with no subject and no body", async () => {
    await expect(
      ingestInboundEmail({ subject: "", body: "" }),
    ).rejects.toBeInstanceOf(EmailIngestValidationError);
    expect(ticketCreate).not.toHaveBeenCalled();
  });

  it("classifies, creates an EMAIL ticket, and writes a SYSTEM audit row", async () => {
    const res = await ingestInboundEmail(
      {
        from: "Dana Lee",
        fromEmail: "dana@acme.com",
        subject: "NDA for Acme Robotics",
        body: "We need a mutual NDA with Acme Robotics before the pilot starts.",
        threadId: "thread-123",
      },
      { now: 1_700_000_000_000, makeTicketId: () => "tkt-email-test" },
    );

    expect(res.classified).toBe(true);
    expect(res.type).toBe("NDA — Standard");
    expect(res.ticketId).toBe("tkt-email-test");

    const data = ticketCreate.mock.calls[0][0].data;
    expect(data.source).toBe("EMAIL");
    expect(data.status).toBe("AWAITING_TRIAGE");
    expect(data.stage).toBe("new");
    expect(data.type).toBe("NDA — Standard");
    // Subject header is prepended to the body for the classifier + attorney.
    expect(data.description).toMatch(/NDA for Acme Robotics/);
    expect(data.description).toMatch(/before the pilot/);

    // intake.ticket.created, SYSTEM actor, email metadata.
    const created = logAuditMock.mock.calls.find(
      (c) => c[0].action === "intake.ticket.created",
    );
    expect(created).toBeTruthy();
    expect(created![0].actorType).toBe("SYSTEM");
    expect(created![0].actorId).toBeNull();
    expect(created![0].metadata.source).toBe("email-channel");
    expect(created![0].metadata.threadId).toBe("thread-123");
  });

  it("still creates a triageable ticket when the classifier finds nothing", async () => {
    const res = await ingestInboundEmail({
      fromEmail: "someone@x.com",
      subject: "Quick question",
      body: "Can you help me with something unrelated to any known category?",
    });
    expect(res.classified).toBe(false);
    expect(res.type).toBe("General Inquiry");
    expect(res.priority).toBe("Medium");
    expect(ticketCreate).toHaveBeenCalledTimes(1);
  });

  it("derives a requester name from the email when no display name is given", async () => {
    await ingestInboundEmail({
      fromEmail: "dana.lee@acme.com",
      subject: "NDA please",
      body: "Need an NDA.",
    });
    // Auto-create upsert uses the derived name "Dana Lee".
    const upsertArg = personUpsert.mock.calls[0][0];
    expect(upsertArg.create.name).toBe("Dana Lee");
    expect(upsertArg.create.metadata.autoCreatedByEmailChannel).toBe(true);
  });

  it("reuses an existing requester Person matched by email", async () => {
    personFindFirst.mockResolvedValueOnce({ id: "p-existing" }); // email hit
    const res = await ingestInboundEmail({
      fromEmail: "known@acme.com",
      subject: "NDA",
      body: "Standard NDA needed.",
    });
    expect(res.requesterId).toBe("p-existing");
    expect(personUpsert).not.toHaveBeenCalled();
  });

  it("applies routing rules at creation and audits each firing", async () => {
    ruleFindMany.mockResolvedValue([
      {
        id: "rule-1",
        name: "NDA fast-lane",
        enabled: true,
        evalOrder: 1,
        matchType: "NDA — Standard",
        matchPriority: null,
        matchDepartment: null,
        matchKeyword: null,
        setAssigneeUserId: null,
        assignee: { name: "AI Auto-Draft" },
        setPriority: "Low",
        setSlaHours: 1,
        timesFired: 0,
        lastFiredAt: null,
      },
    ]);
    const res = await ingestInboundEmail({
      fromEmail: "dana@acme.com",
      subject: "NDA",
      body: "We need an NDA for a vendor.",
    });
    expect(res.firedRuleIds).toEqual(["rule-1"]);
    expect(res.slaHours).toBe(1);
    // Counter bumped + one routing-rule.fired audit row.
    expect(ruleUpdateMany).toHaveBeenCalled();
    const fired = logAuditMock.mock.calls.find(
      (c) => c[0].action === "intake.routing_rule.fired",
    );
    expect(fired).toBeTruthy();
    expect(fired![0].actorType).toBe("SYSTEM");
  });

  it("records attachment filenames in the description (text-only P4a)", async () => {
    await ingestInboundEmail({
      fromEmail: "dana@acme.com",
      subject: "NDA with attachment",
      body: "See attached draft.",
      attachments: [{ filename: "draft-nda.pdf" }, { filename: "terms.docx" }],
    });
    const data = ticketCreate.mock.calls[0][0].data;
    expect(data.description).toMatch(/\[Attachments: draft-nda\.pdf, terms\.docx\]/);
  });
});
