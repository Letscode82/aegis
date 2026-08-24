import { describe, it, expect } from "vitest";
import { buildConcordanceDat, buildOpticonOpt, buildRelativityPayload, type LoadFileManifest } from "../src/export";

const FIELD = String.fromCharCode(20);
const QUAL = String.fromCharCode(254);

const manifest: LoadFileManifest = {
  batesPrefix: "AEGIS",
  produced: [
    { bates: "AEGIS-000001", title: "Pricing model", redacted: false },
    { bates: "AEGIS-000002", title: "Redacted memo", redacted: true },
  ],
  privilegeLog: [{ logNo: "PRIV-0001", title: "Counsel advice", basis: "attorney-client" }],
  counts: { produced: 2, privileged: 1, nonResponsive: 3, uncoded: 0 },
};

describe("buildConcordanceDat", () => {
  it("emits a qualified, delimited header + one row per produced doc", () => {
    const dat = buildConcordanceDat(manifest);
    const lines = dat.split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(3); // header + 2 docs
    expect(lines[0]).toBe([`CONTROL NUMBER`, `TITLE`, `REDACTED`].map((h) => QUAL + h + QUAL).join(FIELD));
    expect(lines[1]).toContain(QUAL + "AEGIS-000001" + QUAL);
    expect(lines[1]!.endsWith(QUAL + "No" + QUAL)).toBe(true);
    expect(lines[2]!.endsWith(QUAL + "Yes" + QUAL)).toBe(true);
  });
  it("strips the reserved qualifier byte from values", () => {
    const dat = buildConcordanceDat({ ...manifest, produced: [{ bates: "X-1", title: `a${QUAL}b`, redacted: false }] });
    expect(dat).toContain(QUAL + "ab" + QUAL);
  });
});

describe("buildOpticonOpt", () => {
  it("emits one page line per doc with a doc break", () => {
    const opt = buildOpticonOpt(manifest).split("\r\n").filter(Boolean);
    expect(opt).toEqual(["AEGIS-000001,,AEGIS-000001.tif,Y,,,1", "AEGIS-000002,,AEGIS-000002.tif,Y,,,1"]);
  });
  it("is empty for an empty produced set", () => {
    expect(buildOpticonOpt({ ...manifest, produced: [] })).toBe("");
  });
});

describe("buildRelativityPayload", () => {
  it("shapes a valid payload", () => {
    const p = buildRelativityPayload(manifest, { instanceUrl: "https://acme.relativity.one/", workspaceId: "1015024" });
    expect(p.workspaceId).toBe("1015024");
    expect(p.instanceUrl).toBe("https://acme.relativity.one"); // trailing slash trimmed
    expect(p.endpoint).toContain("/workspace/1015024/documents");
    expect(p.docCount).toBe(2);
    expect(p.privilegedWithheld).toBe(1);
  });
  it("rejects a non-https instance URL", () => {
    expect(() => buildRelativityPayload(manifest, { instanceUrl: "http://x", workspaceId: "1" })).toThrow(/https/i);
  });
  it("rejects a non-numeric workspace id", () => {
    expect(() => buildRelativityPayload(manifest, { instanceUrl: "https://x.relativity.one", workspaceId: "abc" })).toThrow(/numeric/i);
  });
  it("rejects an empty produced set", () => {
    expect(() => buildRelativityPayload({ ...manifest, produced: [] }, { instanceUrl: "https://x.relativity.one", workspaceId: "1" })).toThrow(/empty/i);
  });
});
