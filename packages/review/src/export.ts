/**
 * Review-set export formats + RelativityOne push payload (pure, unit-tested).
 *
 * - Concordance `.dat` load file (ASCII 20 field delimiter, ASCII 254 text
 *   qualifier — the Concordance/Relativity standard) over the produced set.
 * - Opticon `.opt` image cross-reference (one page per Bates doc).
 * - A RelativityOne "push to workspace" payload preview — the shape a real
 *   Import API call would carry. The actual push is stub-first (documented
 *   seam); this builder is what both the stub and the eventual real client use.
 */
export interface LoadFileManifest {
  batesPrefix: string;
  produced: Array<{ bates: string; title: string; redacted: boolean }>;
  privilegeLog: Array<{ logNo: string; title: string; basis: string }>;
  counts: { produced: number; privileged: number; nonResponsive: number; uncoded: number };
}

// Concordance standard delimiters, referenced by char code so no literal
// control byte lives in source.
const FIELD = String.fromCharCode(20); // field delimiter
const QUAL = String.fromCharCode(254); // text qualifier (þ)
const NL = "\r\n";

function field(v: string): string {
  // Strip the reserved qualifier byte from values, then wrap.
  return QUAL + (v ?? "").split(QUAL).join("") + QUAL;
}

/** Concordance `.dat` — header row + one row per produced document. */
export function buildConcordanceDat(m: LoadFileManifest): string {
  const header = ["CONTROL NUMBER", "TITLE", "REDACTED"].map(field).join(FIELD);
  const rows = m.produced.map((p) => [p.bates, p.title, p.redacted ? "Yes" : "No"].map(field).join(FIELD));
  return [header, ...rows].join(NL) + NL;
}

/** Opticon `.opt` — BATES,VOLUME,PATH,DOCBREAK,,,PAGES (one page per doc). */
export function buildOpticonOpt(m: LoadFileManifest): string {
  return m.produced.map((p) => `${p.bates},,${p.bates}.tif,Y,,,1`).join(NL) + (m.produced.length ? NL : "");
}

export interface RelativityPushRequest {
  instanceUrl: string;
  workspaceId: string;
}

export interface RelativityPushPreview {
  instanceUrl: string;
  workspaceId: string;
  endpoint: string;
  loadFileName: string;
  docCount: number;
  privilegedWithheld: number;
  batesPrefix: string;
}

/** Validate + shape the RelativityOne import request. Throws on bad input. */
export function buildRelativityPayload(m: LoadFileManifest, req: RelativityPushRequest): RelativityPushPreview {
  const instanceUrl = (req.instanceUrl || "").trim().replace(/\/+$/, "");
  const workspaceId = (req.workspaceId || "").trim();
  if (!/^https:\/\/[^\s]+$/i.test(instanceUrl)) throw new Error("A valid https RelativityOne instance URL is required.");
  if (!/^\d+$/.test(workspaceId)) throw new Error("Workspace id must be numeric (the Relativity Artifact ID).");
  if (m.produced.length === 0) throw new Error("Nothing to push — the produced set is empty. Code + produce first.");
  return {
    instanceUrl,
    workspaceId,
    // RelativityOne Import/Load-File Import Manager REST surface.
    endpoint: `${instanceUrl}/Relativity.REST/api/import/workspace/${workspaceId}/documents`,
    loadFileName: `${m.batesPrefix}-load.dat`,
    docCount: m.produced.length,
    privilegedWithheld: m.privilegeLog.length,
    batesPrefix: m.batesPrefix,
  };
}
