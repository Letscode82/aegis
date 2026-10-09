import { describe, it, expect } from "vitest";
import { buildInviteEmailContent } from "../src/internal/services/invite-email";

describe("buildInviteEmailContent", () => {
  it("builds a set-password invite when a link is present", () => {
    const c = buildInviteEmailContent({
      recipientName: "Satish",
      orgName: "Dr Reddy's",
      inviterName: "Harsha",
      roleName: "admin",
      setPasswordUrl: "https://tenant.auth0.com/reset?ticket=xyz",
      appUrl: "https://app.example",
    });
    expect(c.subject).toContain("Dr Reddy's");
    expect(c.heading).toMatch(/set up/i);
    expect(c.button).toEqual({ label: "Set your password", url: "https://tenant.auth0.com/reset?ticket=xyz" });
    expect(c.paragraphs.join(" ")).toContain("Satish");
    expect(c.paragraphs.join(" ")).toContain("Harsha");
    expect(c.paragraphs.join(" ")).toContain("admin");
    expect(c.footnote).toMatch(/expires/i);
  });

  it("falls back to an 'open AEGIS' invite when no link but app url is known", () => {
    const c = buildInviteEmailContent({
      recipientName: "",
      orgName: null,
      setPasswordUrl: null,
      appUrl: "https://app.example",
    });
    expect(c.subject).toContain("AEGIS");
    expect(c.button).toEqual({ label: "Open AEGIS", url: "https://app.example" });
    expect(c.footnote).toBeNull();
  });

  it("omits the button entirely when neither a link nor an app url is available", () => {
    const c = buildInviteEmailContent({
      recipientName: "Jane",
      setPasswordUrl: null,
      appUrl: null,
    });
    expect(c.button).toBeNull();
    expect(c.paragraphs.join(" ")).toContain("administrator will share");
  });

  it("drops the role line when no role is given", () => {
    const c = buildInviteEmailContent({
      recipientName: "Jane",
      setPasswordUrl: "https://x/reset",
    });
    expect(c.paragraphs.some((p) => /access level/i.test(p))).toBe(false);
  });
});
