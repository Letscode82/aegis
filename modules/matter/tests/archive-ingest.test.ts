import { describe, it, expect } from "vitest";
import { parseMbox } from "../src/internal/services/archive-ingest";

const MBOX = `From alice@example.com Mon Sep 01 10:00:00 2026
Subject: Q3 pricing
From: Alice <alice@example.com>
To: Bob <bob@example.com>
Date: Mon, 01 Sep 2026 10:00:00 +0000
Content-Type: text/plain

The Q3 pricing model is attached. Margin is 30%.

From bob@example.com Mon Sep 01 11:00:00 2026
Subject: Re: Q3 pricing
From: Bob <bob@example.com>
Date: Mon, 01 Sep 2026 11:00:00 +0000
Content-Type: multipart/mixed; boundary="XYZ"

--XYZ
Content-Type: text/plain

Looks good, approving.
--XYZ
Content-Type: application/pdf; name="pricing.pdf"
Content-Disposition: attachment; filename="pricing.pdf"
Content-Transfer-Encoding: base64

JVBERi0xLjQK
--XYZ--
`;

describe("parseMbox", () => {
  const msgs = parseMbox(MBOX);

  it("splits into one message per From separator", () => {
    expect(msgs).toHaveLength(2);
  });

  it("parses headers + plain-text body", () => {
    expect(msgs[0].subject).toBe("Q3 pricing");
    expect(msgs[0].from).toContain("alice@example.com");
    expect(msgs[0].to).toContain("bob@example.com");
    expect(msgs[0].date).toBe("2026-09-01T10:00:00.000Z");
    expect(msgs[0].body).toContain("Q3 pricing model");
    expect(msgs[0].attachmentNames).toEqual([]);
  });

  it("extracts the text part and lists attachments from a multipart message", () => {
    expect(msgs[1].subject).toBe("Re: Q3 pricing");
    expect(msgs[1].body).toContain("approving");
    expect(msgs[1].attachmentNames).toContain("pricing.pdf");
  });

  it("falls back to '(no subject)' and tolerates a missing date", () => {
    const one = parseMbox("From x@y.z\nFrom: x@y.z\n\nbody only, no subject");
    expect(one).toHaveLength(1);
    expect(one[0].subject).toBe("(no subject)");
    expect(one[0].date).toBeNull();
    expect(one[0].body).toContain("body only");
  });
});
