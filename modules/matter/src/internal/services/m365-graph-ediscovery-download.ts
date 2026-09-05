/**
 * PROC-7b (increment 2b) — download + inspect a Purview export package.
 *
 * The export hands back authenticated **proxy** download URLs
 * (`proxyservice.ediscovery.svc.cloud.microsoft/...`), split into a small
 * Reports zip (load file / summary metadata) and one or more large Items zips
 * (native files + extracted text). This downloads a package **with the
 * delegated bearer token** (not anonymous), unzips it, and reveals the entry
 * layout + CSV load-file schema — the input the 2c mapping into `ReviewSetItem`
 * needs.
 *
 * Serverless reality (a real limitation): this runs in-request, so it caps the
 * download size. A production items read-back of a real matter (GBs) needs a
 * worker/streaming path — surfaced here as `skippedReason` rather than OOMing.
 */
import { getFreshDelegatedAccessToken } from "./m365-graph-delegated-auth";
import { getReviewSetExportStatus, type ExportFileMeta } from "./m365-graph-ediscovery-export";

export interface ExportZipEntry {
  name: string;
  kind: "csv" | "text" | "other";
  /** CSV: first few lines (header + sample rows). */
  previewLines?: string[];
  /** Text: leading characters of the extracted text. */
  preview?: string | null;
}
export interface ExportPackageInspection {
  operationId: string;
  which: "reports" | "items";
  file: { fileName: string | null; size: number | null; downloadedBytes: number };
  entryCount: number;
  entries: ExportZipEntry[];
  skippedReason: string | null;
}

function pickFile(files: ExportFileMeta[], which: "reports" | "items"): ExportFileMeta | null {
  const withUrl = files.filter((f) => f.downloadUrl);
  if (withUrl.length === 0) return null;
  const needle = which === "reports" ? "report" : "items";
  const matched = withUrl.filter((f) => (f.fileName ?? "").toLowerCase().includes(needle));
  const pool = matched.length > 0 ? matched : [...withUrl].sort((a, b) => (a.size ?? 0) - (b.size ?? 0));
  // reports → smallest; items → smallest matching part (fallback pool is size-asc)
  return pool.sort((a, b) => (a.size ?? 0) - (b.size ?? 0))[0] ?? null;
}

export interface ExportDownloadProbe {
  fileName: string | null;
  urlHost: string | null;
  httpStatus: number;
  ok: boolean;
  contentType: string | null;
  contentLength: string | null;
  byteLength: number;
  firstBytesHex: string;
  firstBytesText: string;
  looksLikeZip: boolean;
}

/**
 * Diagnostic: fetch the export download URL and report the raw response
 * (status / content-type / first bytes) WITHOUT unzipping — so we can see what
 * the proxy actually returns when the bytes aren't a valid zip (redirect body,
 * HTML/JSON error, wrong token audience, etc.).
 */
export async function probeExportDownload(
  organizationId: string,
  caseId: string,
  opts: { operationId?: string; which?: "reports" | "items" } = {},
): Promise<ExportDownloadProbe> {
  const op = await getReviewSetExportStatus(organizationId, caseId, opts.operationId);
  if (!op) throw new Error("No export operation found for this case");
  const which = opts.which ?? "reports";
  const file = pickFile(op.files, which);
  if (!file?.downloadUrl) throw new Error(`No ${which} file with a download URL`);

  const { accessToken } = await getFreshDelegatedAccessToken(organizationId);
  const res = await fetch(file.downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/octet-stream" },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const head = buf.subarray(0, 16);
  let urlHost: string | null = null;
  try { urlHost = new URL(file.downloadUrl).host; } catch { /* ignore */ }
  return {
    fileName: file.fileName,
    urlHost,
    httpStatus: res.status,
    ok: res.ok,
    contentType: res.headers.get("content-type"),
    contentLength: res.headers.get("content-length"),
    byteLength: buf.length,
    firstBytesHex: head.toString("hex"),
    firstBytesText: buf.subarray(0, 300).toString("utf8").replace(/[^\x20-\x7e\n]/g, "."),
    looksLikeZip: head[0] === 0x50 && head[1] === 0x4b, // "PK"
  };
}

export async function inspectExportPackage(
  organizationId: string,
  caseId: string,
  opts: { operationId?: string; which?: "reports" | "items"; maxDownloadBytes?: number } = {},
): Promise<ExportPackageInspection> {
  const op = await getReviewSetExportStatus(organizationId, caseId, opts.operationId);
  if (!op) throw new Error("No export operation found for this case");
  if (op.status !== "succeeded") throw new Error(`Export not finished (status=${op.status ?? "unknown"})`);

  const which = opts.which ?? "reports";
  const file = pickFile(op.files, which);
  if (!file?.downloadUrl) throw new Error(`No ${which} file with a download URL on the export operation`);

  const cap = opts.maxDownloadBytes ?? 30_000_000;
  if ((file.size ?? 0) > cap) {
    return {
      operationId: op.id,
      which,
      file: { fileName: file.fileName, size: file.size, downloadedBytes: 0 },
      entryCount: 0,
      entries: [],
      skippedReason: `file is ${file.size} bytes, over the ${cap}-byte in-request cap — a real items read-back needs a worker/streaming path`,
    };
  }

  const { accessToken } = await getFreshDelegatedAccessToken(organizationId);
  const res = await fetch(file.downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/octet-stream" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Download failed HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());

  const JSZipMod = (await import("jszip")) as unknown as {
    default: { loadAsync: (b: Buffer) => Promise<{ files: Record<string, { dir: boolean; async: (t: "string") => Promise<string> }> }> };
  };
  const zip = await JSZipMod.default.loadAsync(buf);

  const entries: ExportZipEntry[] = [];
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const lower = name.toLowerCase();
    if (lower.endsWith(".csv")) {
      const content = await entry.async("string");
      entries.push({ name, kind: "csv", previewLines: content.split(/\r?\n/).slice(0, 3).map((l) => l.slice(0, 1500)) });
    } else if (lower.endsWith(".txt")) {
      const content = await entry.async("string");
      entries.push({ name, kind: "text", preview: content.slice(0, 400) });
    } else {
      entries.push({ name, kind: "other" });
    }
  }

  return {
    operationId: op.id,
    which,
    file: { fileName: file.fileName, size: file.size, downloadedBytes: buf.length },
    entryCount: entries.length,
    entries,
    skippedReason: null,
  };
}
