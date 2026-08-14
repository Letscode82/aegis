import { describe, it, expect } from "vitest";
import {
  resolveEmailConfig,
  buildResendPayload,
  buildSendgridPayload,
  parseAddress,
  toList,
  DEFAULT_FROM,
} from "../src/providers";
import { renderBasicEmail, escapeHtml } from "../src/render";
import { sendEmail } from "../src/send";
import type { EmailConfig, EmailMessage } from "../src/providers";

describe("resolveEmailConfig", () => {
  it("picks Resend when RESEND_API_KEY is set", () => {
    const c = resolveEmailConfig({ RESEND_API_KEY: "re_x", MAIL_FROM: "Legal <l@x.com>" });
    expect(c.provider).toBe("resend");
    expect(c.apiKey).toBe("re_x");
    expect(c.from).toBe("Legal <l@x.com>");
  });
  it("prefers Resend over SendGrid when both set", () => {
    expect(resolveEmailConfig({ RESEND_API_KEY: "re_x", SENDGRID_API_KEY: "sg_y" }).provider).toBe("resend");
  });
  it("falls back to SendGrid", () => {
    expect(resolveEmailConfig({ SENDGRID_API_KEY: "sg_y" }).provider).toBe("sendgrid");
  });
  it("is 'none' with no keys, and uses the default From", () => {
    const c = resolveEmailConfig({});
    expect(c.provider).toBe("none");
    expect(c.apiKey).toBeUndefined();
    expect(c.from).toBe(DEFAULT_FROM);
  });
  it("ignores blank keys", () => {
    expect(resolveEmailConfig({ RESEND_API_KEY: "  " }).provider).toBe("none");
  });
});

describe("toList / parseAddress", () => {
  it("normalises to a trimmed non-empty array", () => {
    expect(toList(" a@x.com ")).toEqual(["a@x.com"]);
    expect(toList(["a@x.com", "", "  b@x.com "])).toEqual(["a@x.com", "b@x.com"]);
    expect(toList(undefined)).toEqual([]);
  });
  it("parses 'Name <email>' and bare email", () => {
    expect(parseAddress("AEGIS <no-reply@x.com>")).toEqual({ name: "AEGIS", email: "no-reply@x.com" });
    expect(parseAddress("a@x.com")).toEqual({ email: "a@x.com" });
  });
});

describe("payload shaping", () => {
  const msg: EmailMessage = { to: "a@x.com", subject: "Hi", html: "<b>hi</b>", text: "hi", replyTo: "r@x.com" };
  it("Resend payload", () => {
    const p = buildResendPayload(msg, "AEGIS <f@x.com>");
    expect(p).toMatchObject({ from: "AEGIS <f@x.com>", to: ["a@x.com"], subject: "Hi", html: "<b>hi</b>", text: "hi", reply_to: "r@x.com" });
  });
  it("SendGrid payload puts text before html and splits name/email", () => {
    const p = buildSendgridPayload(msg, "AEGIS <f@x.com>");
    expect(p.from).toEqual({ email: "f@x.com", name: "AEGIS" });
    expect(p.personalizations[0]!.to).toEqual([{ email: "a@x.com" }]);
    expect(p.content[0]).toEqual({ type: "text/plain", value: "hi" });
    expect(p.content[1]).toEqual({ type: "text/html", value: "<b>hi</b>" });
    expect(p.personalizations[0]!.to).toHaveLength(1);
    expect(p.reply_to).toEqual({ email: "r@x.com" });
  });
});

describe("renderBasicEmail", () => {
  it("escapes and includes the button url + footnote in both html and text", () => {
    const r = renderBasicEmail({
      heading: "Review <NDA>",
      paragraphs: ['Acme & Co ask you to review.'],
      button: { label: "Open", url: "https://x.com/t/abc" },
      footnote: "Expires soon",
    });
    expect(r.html).toContain("Review &lt;NDA&gt;");
    expect(r.html).toContain("https://x.com/t/abc");
    expect(r.html).toContain("Acme &amp; Co");
    expect(r.text).toContain("Open: https://x.com/t/abc");
    expect(r.text).toContain("Expires soon");
  });
  it("escapeHtml covers the five entities", () => {
    expect(escapeHtml(`<a href="x" a='b'>&`)).toBe("&lt;a href=&quot;x&quot; a=&#39;b&#39;&gt;&amp;");
  });
});

describe("sendEmail", () => {
  const msg: EmailMessage = { to: "a@x.com", subject: "Hi", html: "<b>hi</b>" };

  it("degrades to not-delivered when unconfigured", async () => {
    const r = await sendEmail(msg, { config: { provider: "none", from: DEFAULT_FROM } });
    expect(r).toMatchObject({ delivered: false, provider: "none", reason: "not-configured" });
  });

  it("reports no-recipient without calling fetch", async () => {
    let called = false;
    const r = await sendEmail(
      { ...msg, to: "" },
      { config: { provider: "resend", apiKey: "k", from: DEFAULT_FROM }, fetchImpl: (async () => { called = true; return new Response("{}"); }) as unknown as typeof fetch },
    );
    expect(called).toBe(false);
    expect(r).toMatchObject({ delivered: false, reason: "no-recipient" });
  });

  it("delivers via Resend and returns the id", async () => {
    const config: EmailConfig = { provider: "resend", apiKey: "re_x", from: DEFAULT_FROM };
    let seenUrl = "";
    let seenAuth = "";
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seenUrl = url;
      seenAuth = (init.headers as Record<string, string>).Authorization ?? "";
      return new Response(JSON.stringify({ id: "eml_123" }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await sendEmail(msg, { config, fetchImpl });
    expect(seenUrl).toContain("api.resend.com");
    expect(seenAuth).toBe("Bearer re_x");
    expect(r).toMatchObject({ delivered: true, provider: "resend", id: "eml_123" });
  });

  it("surfaces a provider HTTP error as not-delivered", async () => {
    const config: EmailConfig = { provider: "resend", apiKey: "re_x", from: DEFAULT_FROM };
    const fetchImpl = (async () => new Response("nope", { status: 422 })) as unknown as typeof fetch;
    const r = await sendEmail(msg, { config, fetchImpl });
    expect(r).toMatchObject({ delivered: false, provider: "resend", reason: "http-422" });
  });

  it("never throws — a fetch rejection becomes a structured result", async () => {
    const config: EmailConfig = { provider: "sendgrid", apiKey: "sg_x", from: DEFAULT_FROM };
    const fetchImpl = (async () => { throw new Error("network down"); }) as unknown as typeof fetch;
    const r = await sendEmail(msg, { config, fetchImpl });
    expect(r).toMatchObject({ delivered: false, provider: "sendgrid" });
    expect(r.reason).toContain("network down");
  });
});
