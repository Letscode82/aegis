/**
 * Contract Word (.docx) generation (CTR-11).
 *
 * Produces a real, downloadable Word document from a persisted contract — the
 * "contract document produced during creation" surface. Gathers the contract,
 * its counterparty/org names, and its clause set, and hands them to the shared
 * @aegis/documents renderer. On-demand so the document always reflects the
 * current authored terms; no blob storage needed.
 */
import { prisma } from "@aegis/db";
import {
  renderContractDocx,
  contractDocxFilename,
  renderContractRedlineDocx,
  contractRedlineDocxFilename,
  type ContractRedlineClause,
} from "@aegis/documents";
import { diffContractVersions } from "./versions";

export async function generateContractDocx(
  organizationId: string,
  contractId: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, organizationId },
    include: { counterparty: { select: { name: true } }, organization: { select: { name: true } } },
  });
  if (!contract) throw new Error("Contract not found");

  const clauses = await prisma.contractClause.findMany({
    where: { contractId },
    select: { type: true, text: true, risk: true, deviation: true },
    orderBy: { createdAt: "asc" },
  });

  const buffer = await renderContractDocx({
    contract: {
      id: contract.id,
      title: contract.title,
      type: contract.type,
      status: contract.status,
      counterpartyName: contract.counterparty?.name ?? null,
      orgName: contract.organization?.name ?? null,
      value: contract.value ?? null,
      currency: contract.currency,
      effectiveDate: contract.effectiveDate ? contract.effectiveDate.toISOString() : null,
      expiryDate: contract.expiryDate ? contract.expiryDate.toISOString() : null,
      governingLaw: contract.governingLaw ?? null,
      paymentTerms: contract.paymentTerms ?? null,
      scopeOfServices: contract.scopeOfServices ?? null,
      draftText: contract.draftText ?? null,
    },
    clauses: clauses.map((c) => ({ type: c.type, text: c.text, risk: c.risk, deviation: c.deviation })),
    generatedAt: new Date().toISOString(),
  });

  return { buffer, filename: contractDocxFilename(contract.title, contract.status) };
}

const humanize = (type: string): string => type.replace(/_/g, " ").toLowerCase().replace(/^\w/, (m) => m.toUpperCase());

/**
 * Render the redline between two contract versions as a tracked-changes .docx
 * (CLM Stage 3). Flattens the clause diff into the shared redline renderer:
 * each changed clause carries its word-level `textDiff` as track changes; an
 * added clause is one insertion, a removed clause one deletion; a metadata-only
 * change is shown with a note. Read-only — produces a downloadable artifact,
 * mutates nothing.
 */
export async function generateContractRedlineDocx(
  organizationId: string,
  contractId: string,
  fromVersion: number,
  toVersion: number,
  generatedBy?: string | null,
): Promise<{ buffer: Buffer; filename: string } | null> {
  const contract = await prisma.contract.findFirst({ where: { id: contractId, organizationId }, select: { title: true } });
  if (!contract) throw new Error("Contract not found");

  const diff = await diffContractVersions(organizationId, contractId, fromVersion, toVersion);
  if (!diff) return null;

  const clauses: ContractRedlineClause[] = diff.changes.map((c) => {
    if (c.kind === "added") return { label: humanize(c.type), status: "added" as const, segments: [{ type: "insert" as const, text: c.to.text }] };
    if (c.kind === "removed") return { label: humanize(c.type), status: "removed" as const, segments: [{ type: "delete" as const, text: c.from.text }] };
    // changed — word-level track changes when the text moved; otherwise a
    // metadata-only change rendered as context with a note.
    if (c.textDiff && c.textDiff.length) {
      return { label: humanize(c.type), status: "changed" as const, segments: c.textDiff.map((s) => ({ type: s.type, text: s.text })) };
    }
    const metaBits = c.fields
      .filter((f) => f !== "text")
      .map((f) => (f === "risk" ? `risk ${c.from.risk} → ${c.to.risk}` : f === "deviation" ? `deviation ${c.from.deviation ? "yes" : "no"} → ${c.to.deviation ? "yes" : "no"}` : f))
      .join("; ");
    return { label: humanize(c.type), status: "changed" as const, segments: [{ type: "equal" as const, text: c.to.text }], note: metaBits ? `Metadata changed: ${metaBits}` : null };
  });

  const buffer = await renderContractRedlineDocx({
    title: contract.title,
    fromVersion: diff.fromVersion,
    toVersion: diff.toVersion,
    counts: diff.counts,
    clauses,
    generatedAt: new Date().toISOString(),
    generatedBy: generatedBy ?? null,
  });

  return { buffer, filename: contractRedlineDocxFilename(contract.title, diff.fromVersion, diff.toVersion) };
}
