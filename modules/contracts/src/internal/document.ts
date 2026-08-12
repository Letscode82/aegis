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
import { renderContractDocx, contractDocxFilename } from "@aegis/documents";

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
