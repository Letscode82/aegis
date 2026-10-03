/**
 * Contract authoring — draft-from-template (CLM Phase 4a).
 *
 * The other entry point into a Contract. Intake-spawn creates a contract
 * from an approved ticket; this creates one directly from an approved
 * template (or a blank draft) so counsel can originate paper inside the
 * Contracts module. It:
 *   1. resolves the template body (oKF template store) and fills its
 *      {{variables}},
 *   2. creates a DRAFT Contract, persisting the rendered prose as
 *      `draftText` (the working body the extractor reads and negotiation
 *      turns rewrite),
 *   3. runs the SAME shared extractor as spawn/re-extraction over that
 *      prose — clauses + obligations, chain-sealed, v1 snapshot — so an
 *      authored contract is a first-class citizen the moment it exists.
 *
 * Deterministic and reuse-first: no new extraction logic, no new snapshot
 * logic. Authoring is "create + extractAndPersist" with the body coming
 * from a template instead of a ticket.
 */
import { prisma, logAudit } from "@aegis/db";
import { createContract } from "./service";
import { extractAndPersistContractKnowledge } from "./intake-spawn";
import { getTemplateByKey } from "./templates";
import { getClauseLibraryByType } from "./clause-library";
import { assembleContractBody, type ClauseSelection, type InsertedClause, type LibraryClause } from "./clause-insertion";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

export interface AuthorContractInput {
  title: string;
  /** Human-facing contract type, e.g. "NDA" | "Master Services Agreement". */
  type: string;
  /** Template key to draft from (oKF template store). Omit for a blank draft. */
  templateKey?: string | null;
  /** Explicit body when authoring without a template (or overriding one). */
  body?: string | null;
  counterpartyId?: string | null;
  matterId?: string | null;
  value?: number | null;
  currency?: string | null;
  governingLaw?: string | null;
  /** {{variable}} substitutions applied to the template body. */
  variables?: Record<string, string>;
  /**
   * Clauses to insert from the org clause library beyond what the template's
   * {{clause:CODE}} markers already pull. Each names a clauseType + variant
   * (standard | fallback). A selection whose type a marker already inserted is
   * skipped (no double-insertion). CLM C-7 — dynamic clause insertion.
   */
  clauses?: ClauseSelection[];
}

export interface AuthorContractResult {
  contractId: string;
  title: string;
  clauses: number;
  obligations: number;
  templateName: string | null;
  /** The clauses the library inserted into the authored body (marker + appended). */
  insertedClauses: InsertedClause[];
  /** {{clause:CODE}} codes / selections with no matching library entry, left verbatim. */
  unresolvedClauses: string[];
}

// ── Pure helper (unit-tested; no DB) ─────────────────────────────────

/**
 * Fill `{{ variable }}` placeholders in a template body. Unresolved
 * placeholders are left verbatim (so a reviewer sees what still needs
 * filling rather than a silently blanked contract). Pure.
 */
export function renderTemplateBody(body: string, vars: Record<string, string | null | undefined>): string {
  return (body || "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (whole, key: string) => {
    const v = vars[key];
    return v == null || v === "" ? whole : String(v);
  });
}

// ── Service ──────────────────────────────────────────────────────────

/**
 * Author a new DRAFT contract from a template (or a blank/explicit body).
 * Returns the new contract id plus the extractor's clause/obligation counts.
 */
export async function authorContractFromTemplate(
  organizationId: string,
  input: AuthorContractInput,
  actor: Actor,
): Promise<AuthorContractResult> {
  if (!input.title?.trim()) throw new Error("title is required");
  if (!input.type?.trim()) throw new Error("type is required");

  // Resolve the template body (if any).
  let templateBody = "";
  let templateName: string | null = null;
  if (input.templateKey) {
    const tpl = await getTemplateByKey(organizationId, input.templateKey);
    if (!tpl) throw new Error(`Template "${input.templateKey}" not found`);
    templateBody = tpl.body;
    templateName = tpl.name;
  }
  const rawBody = (input.body ?? templateBody) || "";

  // Dynamic clause insertion (C-7): resolve {{clause:CODE}} markers and append
  // any author-selected library clauses before variable substitution, so an
  // inserted clause may still carry {{variable}} placeholders the render fills.
  // Only touch the clause library when there's something to insert.
  const hasClauseMarker = /\{\{\s*clause:/i.test(rawBody) || /\{\{\s*clauses\s*\}\}/i.test(rawBody);
  let assembledBody = rawBody;
  let insertedClauses: InsertedClause[] = [];
  let unresolvedClauses: string[] = [];
  if (hasClauseMarker || (input.clauses && input.clauses.length > 0)) {
    const byType = await getClauseLibraryByType(organizationId);
    const library: Record<string, LibraryClause> = Object.fromEntries(
      Object.entries(byType).map(([type, e]) => [
        type,
        { clauseType: e.clauseType, title: e.title, standardText: e.standardText, fallbackText: e.fallbackText },
      ]),
    );
    const assembled = assembleContractBody(rawBody, library, input.clauses);
    assembledBody = assembled.body;
    insertedClauses = assembled.inserted;
    unresolvedClauses = assembled.unresolved;
  }

  // Build the substitution context: caller-supplied vars + a few derived.
  let counterpartyName: string | null = null;
  if (input.counterpartyId) {
    const cp = await prisma.counterparty.findFirst({
      where: { id: input.counterpartyId, organizationId },
      select: { name: true },
    });
    counterpartyName = cp?.name ?? null;
  }
  const vars: Record<string, string | null | undefined> = {
    ...(input.variables ?? {}),
    "contract.title": input.title,
    "contract.type": input.type,
    "counterparty.name": counterpartyName ?? input.variables?.["counterparty.name"],
    "contract.governingLaw": input.governingLaw ?? undefined,
  };
  const draftText = renderTemplateBody(assembledBody, vars);

  // Create the DRAFT contract, then persist the working body.
  const contract = await createContract(
    organizationId,
    {
      title: input.title.trim(),
      type: input.type.trim(),
      status: "DRAFT",
      counterpartyId: input.counterpartyId ?? null,
      matterId: input.matterId ?? null,
      value: input.value ?? null,
      currency: input.currency ?? "USD",
      governingLaw: input.governingLaw ?? null,
    },
    { id: actor.id, type: actor.type ?? "USER" },
  );
  await prisma.contract.update({ where: { id: contract.id }, data: { draftText } });

  // Run the shared extractor over the authored prose — clauses + obligations
  // + v1 snapshot, all chain-sealed. Same path as spawn / re-extraction.
  const ext = await extractAndPersistContractKnowledge(
    organizationId,
    contract.id,
    draftText || input.title,
    input.type,
    { id: actor.id, type: "AGENT" },
    { initialSnapshotLabel: templateName ? `Authored from "${templateName}"` : "Authored (blank draft)" },
  );

  // Record the clause-assembly decision (which library clauses + variants went
  // into the authored paper) on the chain — an authoring decision a reviewer
  // can audit, not just the resulting clause rows the extractor wrote.
  if (insertedClauses.length > 0) {
    await logAudit({
      organizationId,
      actorId: actor.id,
      actorType: actor.type ?? "USER",
      action: "contract.authored.clauses_inserted",
      resourceType: "Contract",
      resourceId: contract.id,
      afterJson: {
        inserted: insertedClauses.map((c) => ({ clauseType: c.clauseType, variant: c.variant, source: c.source })),
        unresolved: unresolvedClauses,
      } as never,
      metadata: { source: "contracts", templateKey: input.templateKey ?? null } as never,
    });
  }

  return {
    contractId: contract.id,
    title: contract.title,
    clauses: ext.clauses,
    obligations: ext.obligations,
    templateName,
    insertedClauses,
    unresolvedClauses,
  };
}
