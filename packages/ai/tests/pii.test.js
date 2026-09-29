import { describe, it, expect } from "vitest";
import { detectPII, redactPII, redactMessagesBody } from "../src/pii.js";

describe("detectPII", () => {
  it("counts emails, SSNs, cards, phones, IPs", () => {
    const text = "Email a@b.com, SSN 123-45-6789, card 4111 1111 1111 1111, call 415-555-1234, ip 10.0.0.1";
    const { matches, total } = detectPII(text);
    expect(matches.email).toBe(1);
    expect(matches.ssn).toBe(1);
    expect(matches.card).toBe(1);
    expect(matches.phone).toBe(1);
    expect(matches.ipv4).toBe(1);
    expect(total).toBe(5);
  });

  it("returns zero for clean text", () => {
    expect(detectPII("A routine legal question about indemnification.").total).toBe(0);
  });

  it("tolerates non-string input", () => {
    expect(detectPII(undefined).total).toBe(0);
  });
});

describe("redactPII", () => {
  it("replaces PII with typed placeholders", () => {
    const { redacted, total } = redactPII("Reach jane@acme.com or 415-555-1234.");
    expect(redacted).toContain("[REDACTED_EMAIL]");
    expect(redacted).toContain("[REDACTED_PHONE]");
    expect(redacted).not.toContain("jane@acme.com");
    expect(redacted).not.toContain("415-555-1234");
    expect(total).toBe(2);
  });

  it("leaves clean text unchanged", () => {
    const s = "Please review the attached NDA.";
    expect(redactPII(s).redacted).toBe(s);
  });
});

describe("redactMessagesBody", () => {
  it("scrubs system + string message content", () => {
    const body = {
      system: "Contact admin@corp.com",
      messages: [{ role: "user", content: "My SSN is 123-45-6789" }],
    };
    const { parsed, total } = redactMessagesBody(body);
    expect(parsed.system).toContain("[REDACTED_EMAIL]");
    expect(parsed.messages[0].content).toContain("[REDACTED_SSN]");
    expect(total).toBe(2);
  });

  it("scrubs content-block arrays", () => {
    const body = { messages: [{ role: "user", content: [{ type: "text", text: "email x@y.io" }] }] };
    const { parsed, total } = redactMessagesBody(body);
    expect(parsed.messages[0].content[0].text).toContain("[REDACTED_EMAIL]");
    expect(total).toBe(1);
  });

  it("is a no-op on a body with no PII", () => {
    const body = { messages: [{ role: "user", content: "hello" }] };
    expect(redactMessagesBody(body).total).toBe(0);
  });
});
