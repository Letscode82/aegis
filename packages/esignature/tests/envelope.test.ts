import { describe, it, expect } from "vitest";
import {
  canTransition,
  assertTransition,
  isTerminal,
  isCompleted,
  normalizeStatus,
  validateCreateRequest,
  summarizeEnvelope,
  IllegalEnvelopeTransitionError,
} from "../src/envelope.js";
import type { CreateEnvelopeRequest, EnvelopeStatus } from "../src/types.js";

describe("envelope state machine", () => {
  it("allows legal forward transitions and rejects the rest", () => {
    expect(canTransition("created", "sent")).toBe(true);
    expect(canTransition("sent", "completed")).toBe(true);
    expect(canTransition("delivered", "declined")).toBe(true);
    expect(canTransition("completed", "sent")).toBe(false);
    expect(canTransition("sent", "created")).toBe(false);
    expect(canTransition("sent", "sent")).toBe(false);
  });

  it("knows terminal and completed states", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("voided")).toBe(true);
    expect(isTerminal("sent")).toBe(false);
    expect(isCompleted("completed")).toBe(true);
    expect(isCompleted("declined")).toBe(false);
  });

  it("assertTransition throws a typed error on an illegal move", () => {
    expect(() => assertTransition("completed", "sent")).toThrow(IllegalEnvelopeTransitionError);
    expect(() => assertTransition("created", "sent")).not.toThrow();
  });
});

describe("normalizeStatus", () => {
  it("maps DocuSign native statuses", () => {
    expect(normalizeStatus("docusign", "Completed")).toBe("completed");
    expect(normalizeStatus("docusign", "signed")).toBe("completed");
    expect(normalizeStatus("docusign", "voided")).toBe("voided");
    expect(normalizeStatus("docusign", "delivered")).toBe("delivered");
    expect(normalizeStatus("docusign", "something-new")).toBe("sent");
  });

  it("maps Adobe Sign native statuses", () => {
    expect(normalizeStatus("adobesign", "OUT_FOR_SIGNATURE")).toBe("sent");
    expect(normalizeStatus("adobesign", "SIGNED")).toBe("completed");
    expect(normalizeStatus("adobesign", "COMPLETED")).toBe("completed");
    expect(normalizeStatus("adobesign", "CANCELLED")).toBe("voided");
    expect(normalizeStatus("adobesign", "AUTHORING")).toBe("created");
    expect(normalizeStatus("adobesign", "weird")).toBe("sent");
  });
});

describe("validateCreateRequest", () => {
  const good: CreateEnvelopeRequest = {
    subject: "Please sign",
    documents: [{ name: "c.pdf", mimeType: "application/pdf", content: new Uint8Array([1]) }],
    recipients: [{ email: "a@b.com", name: "A" }],
  };

  it("passes a well-formed request", () => {
    expect(validateCreateRequest(good)).toEqual([]);
  });

  it("collects every problem", () => {
    const problems = validateCreateRequest({
      subject: "  ",
      documents: [{ name: "empty.pdf", mimeType: "application/pdf", content: new Uint8Array() }],
      recipients: [{ email: "not-an-email", name: "", role: "cc" }],
    });
    expect(problems).toContain("subject is required");
    expect(problems).toContain('document "empty.pdf" has no content');
    expect(problems).toContain("at least one signer is required");
    expect(problems.some((p) => p.includes("invalid email"))).toBe(true);
  });
});

describe("summarizeEnvelope", () => {
  it("rolls up recipient counts", () => {
    const status: EnvelopeStatus = {
      provider: "docusign",
      envelopeId: "env-1",
      status: "sent",
      recipients: [
        { email: "a@b.com", name: "A", status: "signed", signedAt: "2026-01-02T00:00:00Z" },
        { email: "c@d.com", name: "C", status: "pending" },
        { email: "e@f.com", name: "E", status: "declined" },
      ],
    };
    const s = summarizeEnvelope(status);
    expect(s).toMatchObject({ totalSigners: 3, signed: 1, pending: 1, declined: 1, terminal: false, completed: false });
  });
});
