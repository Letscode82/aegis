/**
 * INV-1 — internal investigations. Turns a source letter / allegation into a
 * running Matter of type INVESTIGATION plus a draft plan: AI-extracted issue
 * codes, standard workstream steps, custodian hints, and a collection scope
 * suggestion. The Matter carries lifecycle + parties + holds + the audit chain;
 * the Investigation row carries the working state that feeds the hold +
 * collection flow (createAdhocCollection already accepts `source:
 * "INVESTIGATION"`).
 *
 * Issue extraction is deterministic today (the shared @aegis/ai-review drafter,
 * freeze-safe per the 4d Matter/Legal-Hold AI freeze); a Claude-backed drafter
 * drops in behind the same shape later. The attorney edits everything the draft
 * proposes — it is a head start, never an authority.
 */
import { prisma, logAudit, type Investigation } from "@aegis/db";
import { draftReviewCriteria } from "@aegis/ai-review";
import { createMatterService } from "./matter";
import type { MatterActor } from "../types";

export interface InvestigationIssue { key: string; label: string }
export interface CustodianHint { name: string; rationale: string }
export interface InvestigationPlan {
  steps: string[];
  custodianHints: CustodianHint[];
  scopeSuggestion: string;
  dataSources: string[];
}
export interface InvestigationDraft {
  title: string;
  issues: InvestigationIssue[];
  plan: InvestigationPlan;
}

const STANDARD_STEPS = [
  "Preserve relevant data (issue a legal hold on identified custodians)",
  "Collect from custodian mailboxes, OneDrive, SharePoint, and Teams",
  "Cull with threading + near-duplicate suppression to the in-scope set",
  "AI-assisted issue-coded review; validate on a sample before scaling",
  "Assemble the chronology and interview list from coded documents",
  "Draft the findings report and, if needed, produce to the requester",
];
const DEFAULT_DATA_SOURCES = ["Exchange mailbox", "OneDrive", "SharePoint", "Teams / chat"];

/** Deterministic role-based custodian hints derived from the extracted issue
 *  themes — a starting roster the investigator refines against the directory. */
function custodianHintsFor(issues: InvestigationIssue[]): CustodianHint[] {
  const hints: CustodianHint[] = [];
  const keys = new Set(issues.map((i) => i.key));
  if (keys.has("IP_TRADE_SECRET")) hints.push({ name: "Engineering leadership", rationale: "Owns the source code / designs alleged to be misappropriated." });
  if (keys.has("FINANCIAL")) hints.push({ name: "Finance / accounting owners", rationale: "Custodians of the invoices, forecasts, and ledgers at issue." });
  if (keys.has("EMPLOYMENT")) hints.push({ name: "HR business partner", rationale: "Holds personnel, performance, and separation records." });
  if (keys.has("CONTRACT")) hints.push({ name: "Contract / procurement owner", rationale: "Custodian of the agreements and vendor correspondence." });
  if (keys.has("ANTITRUST") || keys.has("COMPLIANCE")) hints.push({ name: "Sales / commercial leads", rationale: "Pricing and competitor communications relevant to the allegation." });
  hints.push({ name: "The subject(s) named in the source", rationale: "Primary custodian — their mailbox and drives are the first target." });
  return hints.slice(0, 5);
}

/** Extract issues + draft a plan from a source letter — pure preview, no
 *  persistence. The UI calls this before the investigator commits. */
export function extractInvestigationPlan(sourceText: string, title?: string): InvestigationDraft {
  const draft = draftReviewCriteria({ description: sourceText, context: title });
  const issues = draft.issues;
  return {
    title: title?.trim() || draft.name.replace(/ — review profile$/, "") || "Investigation",
    issues,
    plan: {
      steps: STANDARD_STEPS,
      custodianHints: custodianHintsFor(issues),
      scopeSuggestion: draft.criteria,
      dataSources: DEFAULT_DATA_SOURCES,
    },
  };
}

export interface CreateInvestigationInput {
  title: string;
  sourceText: string;
  jurisdiction?: string;
}
export interface InvestigationDTO {
  id: string;
  matterId: string;
  matterNumber: string | null;
  matterTitle: string;
  status: string;
  sourceText: string;
  issues: InvestigationIssue[];
  plan: InvestigationPlan | null;
  createdAt: string;
}

function toDTO(inv: Investigation, matter: { matterNumber: string | null; title: string }): InvestigationDTO {
  return {
    id: inv.id, matterId: inv.matterId, matterNumber: matter.matterNumber, matterTitle: matter.title,
    status: inv.status, sourceText: inv.sourceText,
    issues: (inv.issuesJson as InvestigationIssue[] | null) ?? [],
    plan: (inv.planJson as InvestigationPlan | null) ?? null,
    createdAt: inv.createdAt.toISOString(),
  };
}

/** Open an investigation: extract the plan, create the backing OPEN Matter of
 *  type INVESTIGATION, and persist the Investigation companion. Chain-sealed
 *  (the Matter create writes its own matter.created row; this adds
 *  investigation.created). */
export async function createInvestigationService(input: CreateInvestigationInput, actor: MatterActor): Promise<InvestigationDTO> {
  const sourceText = (input.sourceText || "").trim();
  if (!sourceText) throw new Error("An investigation requires source text (the allegation / referral).");
  const draft = extractInvestigationPlan(sourceText, input.title);

  const matter = await createMatterService(
    { title: (input.title || draft.title).trim(), type: "INVESTIGATION", description: sourceText.slice(0, 500), jurisdiction: input.jurisdiction, initialStatus: "OPEN" },
    actor,
  );
  const inv = await prisma.investigation.create({
    data: {
      organizationId: actor.organizationId, matterId: matter.id, sourceText,
      issuesJson: draft.issues as never, planJson: draft.plan as never, status: "ACTIVE", createdById: actor.id,
    },
  });
  await logAudit({
    organizationId: actor.organizationId, actorId: actor.id, actorType: "USER",
    action: "investigation.created", resourceType: "Investigation", resourceId: inv.id,
    afterJson: { matterId: matter.id, title: matter.title, issues: draft.issues.length } as never,
    metadata: { source: "ui", channel: "investigations" } as never,
  });
  return toDTO(inv, { matterNumber: matter.matterNumber, title: matter.title });
}

export async function listInvestigationsService(organizationId: string): Promise<InvestigationDTO[]> {
  const rows = await prisma.investigation.findMany({
    where: { organizationId },
    include: { matter: { select: { matterNumber: true, title: true } } },
    orderBy: [{ createdAt: "desc" }],
  });
  return rows.map((r) => toDTO(r, r.matter));
}

export async function getInvestigationService(organizationId: string, matterId: string): Promise<InvestigationDTO | null> {
  const r = await prisma.investigation.findFirst({
    where: { organizationId, matterId },
    include: { matter: { select: { matterNumber: true, title: true } } },
  });
  return r ? toDTO(r, r.matter) : null;
}
