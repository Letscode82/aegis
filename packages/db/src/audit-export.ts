/**
 * Defensibility export — PDF + machine-readable JSON.
 *
 * Produces a court-ready artifact for any subset of audit rows:
 *
 *   - **JSON report** — every row's stored fields PLUS the canonical-
 *     content text the BEFORE INSERT trigger hashed. Auditors can
 *     SHA-256 the canonical text and compare to the stored contentHash
 *     without needing to reproduce Postgres' JSONB normalisation.
 *
 *   - **PDF** — visual rendering of the same data. The JSON report is
 *     embedded as a PDF file attachment AND mirrored into the Info
 *     dictionary under "AegisChainData" (base64) so chain-of-custody
 *     tooling can extract it from either surface.
 *
 *   - **Seal** — the verifier walks the *whole* organisation chain
 *     and includes the verification result, head hash, tail prevHash
 *     in both surfaces. A subset export is still defensible because
 *     the seal certifies the entire chain that contains the subset.
 *
 * Rows are pulled in chainPosition order so the JSON output mirrors
 * the chain. Filters narrow the rendered subset; the chain seal still
 * covers the whole org.
 */
import PDFDocument from "pdfkit";
import { prisma } from "./client";
import {
  verifyAuditChain,
  type ChainVerificationResult,
} from "./audit-verify";

export interface AuditDefensibilityFilter {
  organizationId: string;
  fromDate?: Date;
  toDate?: Date;
  resourceType?: string;
  resourceId?: string;
  actorId?: string;
  action?: string;
}

export interface AuditDefensibilityRow {
  id: string;
  chainPosition: string; // bigint serialised as decimal string
  schemaVersion: number;
  timestamp: string; // ISO string
  actorId: string | null;
  actorType: string;
  action: string;
  resourceType: string;
  resourceId: string;
  beforeJson: unknown;
  afterJson: unknown;
  metadata: unknown;
  prevHash: string;
  contentHash: string;
  /** Verbatim text the BEFORE INSERT trigger hashed for this row. */
  canonicalContent: string;
}

export interface AuditDefensibilityJsonReport {
  $schema: "aegis.audit.defensibility.v1";
  generatedAt: string;
  organizationId: string;
  filter: {
    fromDate: string | null;
    toDate: string | null;
    resourceType: string | null;
    resourceId: string | null;
    actorId: string | null;
    action: string | null;
  };
  chainVerification: {
    intact: boolean;
    rowsChecked: number;
    breaks: Array<{
      chainPosition: string;
      rowId: string;
      reason: ChainVerificationResult["breaks"][number]["reason"];
      details: string;
    }>;
    headHash: string | null;
    tailPrevHash: string | null;
    schemaVersion: number;
    verifiedAt: string;
  };
  /** Rows in scope, ordered by chainPosition ASC. */
  rows: AuditDefensibilityRow[];
  seal: {
    algorithm: "sha256";
    hashFunction: "audit_log_compute_hash";
    canonicalContentSchemaVersion: number;
    rowsInScope: number;
  };
}

export interface AuditDefensibilityReport {
  pdfBuffer: Buffer;
  jsonReport: AuditDefensibilityJsonReport;
}

interface RawRow {
  id: string;
  chainPosition: bigint;
  schemaVersion: number;
  timestamp: Date;
  actorId: string | null;
  actorType: string;
  action: string;
  resourceType: string;
  resourceId: string;
  beforeJson: unknown;
  afterJson: unknown;
  metadata: unknown;
  prevHash: string;
  contentHash: string;
  canonicalContent: string;
}

async function fetchRows(filter: AuditDefensibilityFilter): Promise<RawRow[]> {
  // We pull canonicalContent directly from the SQL helper so the
  // exported JSON contains the *exact* string the chain hashed. This
  // is the key to off-database verification: an auditor can run
  // SHA-256 over each canonicalContent and compare to contentHash
  // without re-implementing JSONB normalisation.
  return prisma.$queryRaw<RawRow[]>`
    SELECT
      al."id",
      al."chainPosition",
      al."schemaVersion",
      al."timestamp",
      al."actorId",
      al."actorType",
      al."action",
      al."resourceType",
      al."resourceId",
      al."beforeJson",
      al."afterJson",
      al."metadata",
      al."prevHash",
      al."contentHash",
      audit_log_canonical_content(
        al."schemaVersion", al."organizationId", al."actorId", al."actorType",
        al."action", al."resourceType", al."resourceId",
        al."beforeJson", al."afterJson", al."metadata",
        al."timestamp", al."prevHash", al."chainPosition"
      ) AS "canonicalContent"
    FROM "AuditLog" al
    WHERE al."organizationId" = ${filter.organizationId}
      AND (${filter.fromDate ?? null}::timestamp IS NULL OR al."timestamp" >= ${filter.fromDate ?? null}::timestamp)
      AND (${filter.toDate ?? null}::timestamp IS NULL OR al."timestamp" <= ${filter.toDate ?? null}::timestamp)
      AND (${filter.resourceType ?? null}::text IS NULL OR al."resourceType" = ${filter.resourceType ?? null}::text)
      AND (${filter.resourceId ?? null}::text IS NULL OR al."resourceId" = ${filter.resourceId ?? null}::text)
      AND (${filter.actorId ?? null}::text IS NULL OR al."actorId" = ${filter.actorId ?? null}::text)
      AND (${filter.action ?? null}::text IS NULL OR al."action" = ${filter.action ?? null}::text)
    ORDER BY al."chainPosition" ASC
  `;
}

function toJsonReport(
  filter: AuditDefensibilityFilter,
  verification: ChainVerificationResult,
  rows: RawRow[],
): AuditDefensibilityJsonReport {
  return {
    $schema: "aegis.audit.defensibility.v1",
    generatedAt: new Date().toISOString(),
    organizationId: filter.organizationId,
    filter: {
      fromDate: filter.fromDate?.toISOString() ?? null,
      toDate: filter.toDate?.toISOString() ?? null,
      resourceType: filter.resourceType ?? null,
      resourceId: filter.resourceId ?? null,
      actorId: filter.actorId ?? null,
      action: filter.action ?? null,
    },
    chainVerification: {
      intact: verification.intact,
      rowsChecked: verification.rowsChecked,
      breaks: verification.breaks.map((b) => ({
        chainPosition: b.chainPosition.toString(),
        rowId: b.rowId,
        reason: b.reason,
        details: b.details,
      })),
      headHash: verification.headHash,
      tailPrevHash: verification.tailPrevHash,
      schemaVersion: verification.schemaVersion,
      verifiedAt: verification.verifiedAt.toISOString(),
    },
    rows: rows.map((r) => ({
      id: r.id,
      chainPosition: r.chainPosition.toString(),
      schemaVersion: r.schemaVersion,
      timestamp: r.timestamp.toISOString(),
      actorId: r.actorId,
      actorType: r.actorType,
      action: r.action,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      beforeJson: r.beforeJson,
      afterJson: r.afterJson,
      metadata: r.metadata,
      prevHash: r.prevHash,
      contentHash: r.contentHash,
      canonicalContent: r.canonicalContent,
    })),
    seal: {
      algorithm: "sha256",
      hashFunction: "audit_log_compute_hash",
      canonicalContentSchemaVersion: verification.schemaVersion,
      rowsInScope: rows.length,
    },
  };
}

function renderPdf(report: AuditDefensibilityJsonReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margin: 56,
      info: {
        Title: "AEGIS — AuditLog Defensibility Report",
        Author: "AEGIS",
        Subject: `Audit chain export for org ${report.organizationId}`,
        Keywords: "audit defensibility chain-of-custody",
        CreationDate: new Date(),
      },
    });

    // PDF Info dictionary supports custom keys. Tooling can pull the
    // base64-encoded chain data without parsing the visual layer.
    const jsonString = JSON.stringify(report);
    (doc.info as unknown as Record<string, string>).AegisChainData =
      Buffer.from(jsonString, "utf8").toString("base64");

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── Header ─────────────────────────────────────────────────────
    doc
      .fontSize(20)
      .fillColor("#0F172A")
      .text("AEGIS — AuditLog Defensibility Report", { align: "left" });
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .fillColor("#475569")
      .text(`Organization: ${report.organizationId}`)
      .text(`Generated: ${report.generatedAt}`)
      .text(
        `Schema: ${report.$schema} (canonical-content v${report.seal.canonicalContentSchemaVersion})`,
      )
      .text(
        `Hash: ${report.seal.algorithm} via ${report.seal.hashFunction}`,
      );
    doc.moveDown(1);

    // ── Verification panel ─────────────────────────────────────────
    const v = report.chainVerification;
    doc
      .fontSize(13)
      .fillColor(v.intact ? "#059669" : "#DC2626")
      .text(
        `Chain verification: ${v.intact ? "INTACT" : "BROKEN"} (${v.rowsChecked} rows)`,
      );
    doc.moveDown(0.3);
    doc
      .fontSize(9)
      .fillColor("#0F172A")
      .text(`Verified at: ${v.verifiedAt}`)
      .text(`Head hash: ${v.headHash ?? "(empty chain)"}`)
      .text(`Tail prevHash: ${v.tailPrevHash ?? "(empty chain)"}`);

    if (!v.intact) {
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor("#DC2626").text("Chain breaks:");
      for (const b of v.breaks) {
        doc
          .fontSize(9)
          .fillColor("#0F172A")
          .text(
            `  pos=${b.chainPosition} id=${b.rowId} reason=${b.reason} :: ${b.details}`,
          );
      }
    }

    doc.moveDown(1);

    // ── Filter summary ─────────────────────────────────────────────
    doc.fontSize(13).fillColor("#0F172A").text("Filter (rows in scope)");
    doc.moveDown(0.3);
    doc.fontSize(9);
    const f = report.filter;
    const filterLines = [
      `From date: ${f.fromDate ?? "—"}`,
      `To date: ${f.toDate ?? "—"}`,
      `Resource type: ${f.resourceType ?? "—"}`,
      `Resource id: ${f.resourceId ?? "—"}`,
      `Actor id: ${f.actorId ?? "—"}`,
      `Action: ${f.action ?? "—"}`,
      `Rows in scope: ${report.seal.rowsInScope}`,
    ];
    for (const line of filterLines) doc.text(line);
    doc.moveDown(1);

    // ── Rows ───────────────────────────────────────────────────────
    doc.fontSize(13).fillColor("#0F172A").text("Audit rows (chronological)");
    doc.moveDown(0.3);
    for (const row of report.rows) {
      if (doc.y > 700) doc.addPage();
      doc
        .fontSize(10)
        .fillColor("#0F172A")
        .text(
          `pos=${row.chainPosition}  ${row.timestamp}  ${row.action}`,
          { continued: false },
        );
      doc
        .fontSize(8)
        .fillColor("#475569")
        .text(
          `  resource=${row.resourceType}/${row.resourceId}  actor=${row.actorType}:${row.actorId ?? "system"}`,
        )
        .text(`  contentHash=${row.contentHash}`)
        .text(`  prevHash=${row.prevHash}`);
      if (row.beforeJson || row.afterJson) {
        const before = row.beforeJson
          ? JSON.stringify(row.beforeJson)
          : "(none)";
        const after = row.afterJson
          ? JSON.stringify(row.afterJson)
          : "(none)";
        doc
          .text(`  before=${before.slice(0, 240)}${before.length > 240 ? "…" : ""}`)
          .text(`  after=${after.slice(0, 240)}${after.length > 240 ? "…" : ""}`);
      }
      doc.moveDown(0.4);
    }

    // ── Embedded JSON attachment ───────────────────────────────────
    // pdfkit's `file()` adds a real PDF embedded-files entry that
    // viewers expose via the attachments panel. Programmatic tools can
    // read either this OR the Info-dict key above.
    const jsonBuf = Buffer.from(jsonString, "utf8");
    doc.file(jsonBuf, {
      name: "aegis-chain-data.json",
      type: "application/json",
      description:
        "Machine-readable chain export. Hash each row's canonicalContent with SHA-256 and compare to contentHash to verify off-database.",
    });

    doc.end();
  });
}

export async function exportAuditDefensibilityReport(
  filter: AuditDefensibilityFilter,
): Promise<AuditDefensibilityReport> {
  // Verification always covers the whole organisation chain so a
  // subset export still certifies the chain that contains it.
  const verification = await verifyAuditChain(filter.organizationId);
  const rows = await fetchRows(filter);
  const jsonReport = toJsonReport(filter, verification, rows);
  const pdfBuffer = await renderPdf(jsonReport);
  return { pdfBuffer, jsonReport };
}
