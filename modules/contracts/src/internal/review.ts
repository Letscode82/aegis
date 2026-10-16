/**
 * Contract review → graded redline on their paper (PR C — the flagship).
 *
 * Takes a contract's extracted clauses, grades each against the published
 * Playbook (Standard / Fallback / Escalate), flags required clauses the
 * document is MISSING, and drafts our-position replacement/insertion language
 * as the tracked-change target — persisted as a ContractReview + ReviewFinding
 * rows. Every actionable finding writes a PENDING AgentDecision; a human
 * ACCEPT / REJECT / EDIT is the only path off PENDING. Applying the accepted
 * findings builds a new, chain-sealed ContractVersion (the marked-up doc).
 *
 * The derived snapshot+audit model couldn't represent a MISSING clause, a
 * three-field gap card, or accept/reject state — so this is the one genuinely
 * new persistence surface in the programme.
 *
 * Pure grading core (buildReviewFindings / summarizeFindings) is unit-tested;
 * the DB service composes it with the existing extraction + versioning.
 */
import {
  prisma,
  logAudit,
  sha256Hex,
  AgentApprovalStatus,
  type ReviewPaperType,
  type ContractPerspective,
} from "@aegis/db";
import { CLAUDE_MODEL } from "@aegis/ai";
import { getPlaybookForContract, ensureDefaultPlaybook, gradeClauseAgainstRule, type PlaybookRuleDTO, type ContractPlaybookDTO } from "./playbook";
import { snapshotContractVersion } from "./versions";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

const AGENT_NAME = "contract-reviewer";
const RESOURCE_TYPE = "ReviewFinding";

export type ReviewGradeT = "STANDARD" | "FALLBACK" | "ESCALATE" | "MISSING";
export type EditKindT = "REPLACEMENT" | "INSERTION" | "DELETION" | "NONE";
export type DecisionT = "PENDING" | "ACCEPTED" | "REJECTED" | "EDITED";

export interface ReviewClauseInput {
  anchorId: string;
  clauseType: string;
  text: string;
}

export interface BuiltFinding {
  clauseAnchorId: string | null;
  clauseType: string;
  grade: ReviewGradeT;
  editKind: EditKindT;
  ourPosition: string | null;
  theirPosition: string | null;
  rationale: string;
  suggestedText: string | null;
  playbookRuleId: string | null;
  severity: number;
  orderIndex: number;
}

export interface ReviewSummary {
  standard: number;
  fallback: number;
  escalate: number;
  missing: number;
  total: number;
  /** 0..100 — share of measurable weight sitting at an acceptable position. */
  weightedScore: number;
  verdict: string;
  riskBand: "LOW" | "MEDIUM" | "HIGH";
  /** OUR_PAPER_THEIR_MARKS only — the version their marks were diffed against. */
  baselineVersion?: number | null;
}

// ── Pure core (no DB, no AI — unit-tested) ────────────────────────────

function gradeSeverity(grade: ReviewGradeT, weight: number): number {
  switch (grade) {
    case "ESCALATE": return 3 * weight;
    case "MISSING": return 3 * weight;
    case "FALLBACK": return 1 * weight;
    default: return 0;
  }
}

/**
 * Grade a document's clauses against playbook rules and produce findings.
 * Covers present clauses (Standard/Fallback/Escalate) AND required rules the
 * document omits (MISSING → an insertion of our language). Deterministic.
 */
export function buildReviewFindings(clauses: ReviewClauseInput[], rules: PlaybookRuleDTO[]): BuiltFinding[] {
  const rulesByType = new Map<string, PlaybookRuleDTO>();
  for (const r of rules) if (!rulesByType.has(r.clauseType)) rulesByType.set(r.clauseType, r);

  const findings: BuiltFinding[] = [];
  const coveredTypes = new Set<string>();
  let order = 0;

  for (const clause of clauses) {
    const rule = rulesByType.get(clause.clauseType);
    coveredTypes.add(clause.clauseType);
    if (!rule) {
      // No playbook position for this clause type — informational, no edit.
      findings.push({
        clauseAnchorId: clause.anchorId, clauseType: clause.clauseType, grade: "STANDARD", editKind: "NONE",
        ourPosition: null, theirPosition: clause.text, rationale: "No playbook position on file for this clause type.",
        suggestedText: null, playbookRuleId: null, severity: 0, orderIndex: order++,
      });
      continue;
    }
    const g = gradeClauseAgainstRule(clause.text, rule);
    if (g.grade === "STANDARD") {
      findings.push({
        clauseAnchorId: clause.anchorId, clauseType: clause.clauseType, grade: "STANDARD", editKind: "NONE",
        ourPosition: rule.preferredText, theirPosition: clause.text, rationale: "Matches our standard position.",
        suggestedText: null, playbookRuleId: rule.id, severity: 0, orderIndex: order++,
      });
      continue;
    }
    // FALLBACK or ESCALATE → propose our language as a replacement.
    const fb = g.fallbackIndex != null ? rule.fallbackTexts[g.fallbackIndex] : undefined;
    const suggested = g.grade === "FALLBACK" && fb ? fb : rule.preferredText;
    const why = g.requiredLanguageMissing
      ? `Missing required language${rule.requiredLanguage ? `: "${rule.requiredLanguage}"` : ""}. ${rule.guidance ?? ""}`.trim()
      : g.grade === "ESCALATE"
      ? `Off-playbook — deviates from our preferred and acceptable fallback positions. ${rule.escalationTrigger ?? rule.guidance ?? ""}`.trim()
      : `Acceptable fallback, not our preferred position. ${rule.guidance ?? ""}`.trim();
    findings.push({
      clauseAnchorId: clause.anchorId, clauseType: clause.clauseType, grade: g.grade, editKind: "REPLACEMENT",
      ourPosition: rule.preferredText, theirPosition: clause.text, rationale: why,
      suggestedText: suggested, playbookRuleId: rule.id,
      severity: gradeSeverity(g.grade, rule.severityWeight), orderIndex: order++,
    });
  }

  // Required rules with no matching clause → MISSING (insertion).
  for (const rule of rules) {
    if (!rule.required) continue;
    if (coveredTypes.has(rule.clauseType)) continue;
    findings.push({
      clauseAnchorId: null, clauseType: rule.clauseType, grade: "MISSING", editKind: "INSERTION",
      ourPosition: rule.preferredText, theirPosition: null,
      rationale: `Required clause is missing from their paper. ${rule.guidance ?? ""}`.trim(),
      suggestedText: rule.requiredLanguage || rule.preferredText, playbookRuleId: rule.id,
      severity: gradeSeverity("MISSING", rule.severityWeight), orderIndex: order++,
    });
  }

  return findings;
}

export interface BaselineClauseInput {
  clauseType: string;
  text: string;
}

/** Occurrence-stable key so clauses of the same type line up across the two
 *  sides of the diff (LIABILITY_CAP#0 ↔ LIABILITY_CAP#0). */
function occurrenceKeyed<T extends { clauseType: string }>(items: T[]): Map<string, T> {
  const seen: Record<string, number> = {};
  const m = new Map<string, T>();
  for (const it of items) {
    const i = seen[it.clauseType] ?? 0;
    seen[it.clauseType] = i + 1;
    m.set(`${it.clauseType}#${i}`, it);
  }
  return m;
}

const norm = (s: string): string => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Delta-grade the counterparty's marks on OUR paper (PR C2).
 *
 * The baseline is our last-authored clause set (the version we sent); `current`
 * is the document as they returned it. Only clauses THEY touched produce
 * findings — a clause they left as we drafted it is our language and is silent.
 *
 *   • they modified our clause  → grade their new text; off-playbook → REPLACEMENT
 *                                 (revert to our sent language as the target)
 *   • they deleted our clause   → required → MISSING/INSERTION (re-insert ours);
 *                                 otherwise an advisory re-insert
 *   • they added a new clause   → grade it; off-playbook or unanchored to our
 *                                 paper → REPLACEMENT to our position, or a
 *                                 DELETION to strike their unilateral addition
 */
export function buildDeltaReviewFindings(
  baseline: BaselineClauseInput[],
  current: ReviewClauseInput[],
  rules: PlaybookRuleDTO[],
): BuiltFinding[] {
  const rulesByType = new Map<string, PlaybookRuleDTO>();
  for (const r of rules) if (!rulesByType.has(r.clauseType)) rulesByType.set(r.clauseType, r);

  const base = occurrenceKeyed(baseline);
  const cur = occurrenceKeyed(current);
  const findings: BuiltFinding[] = [];
  let order = 0;

  for (const [key, clause] of cur) {
    const rule = rulesByType.get(clause.clauseType);
    const b = base.get(key);

    // ── They added a clause not in our paper ──────────────────────────
    if (!b) {
      if (rule) {
        const g = gradeClauseAgainstRule(clause.text, rule);
        if (g.grade === "STANDARD") {
          findings.push({
            clauseAnchorId: clause.anchorId, clauseType: clause.clauseType, grade: "STANDARD", editKind: "NONE",
            ourPosition: rule.preferredText, theirPosition: clause.text,
            rationale: "Counterparty added a clause that matches our standard position.",
            suggestedText: null, playbookRuleId: rule.id, severity: 0, orderIndex: order++,
          });
          continue;
        }
        const fb = g.fallbackIndex != null ? rule.fallbackTexts[g.fallbackIndex] : undefined;
        findings.push({
          clauseAnchorId: clause.anchorId, clauseType: clause.clauseType, grade: g.grade, editKind: "REPLACEMENT",
          ourPosition: rule.preferredText, theirPosition: clause.text,
          rationale: `Counterparty added this clause — ${g.grade === "ESCALATE" ? "off our positions" : "acceptable but not preferred"}. ${rule.guidance ?? ""}`.trim(),
          suggestedText: g.grade === "FALLBACK" && fb ? fb : rule.preferredText, playbookRuleId: rule.id,
          severity: gradeSeverity(g.grade, rule.severityWeight), orderIndex: order++,
        });
      } else {
        // Their unilateral addition with no playbook position — strike it.
        findings.push({
          clauseAnchorId: clause.anchorId, clauseType: clause.clauseType, grade: "ESCALATE", editKind: "DELETION",
          ourPosition: null, theirPosition: clause.text,
          rationale: "Counterparty added a clause that is not in our paper and has no playbook position — strike or escalate.",
          suggestedText: null, playbookRuleId: null, severity: gradeSeverity("ESCALATE", 1), orderIndex: order++,
        });
      }
      continue;
    }

    // ── They left our clause as drafted — our language, silent ─────────
    if (norm(b.text) === norm(clause.text)) continue;

    // ── They modified our clause ──────────────────────────────────────
    if (!rule) {
      findings.push({
        clauseAnchorId: clause.anchorId, clauseType: clause.clauseType, grade: "FALLBACK", editKind: "REPLACEMENT",
        ourPosition: b.text, theirPosition: clause.text,
        rationale: "Counterparty edited our clause; no playbook position on file — revert to our sent language suggested.",
        suggestedText: b.text, playbookRuleId: null, severity: gradeSeverity("FALLBACK", 1), orderIndex: order++,
      });
      continue;
    }
    const g = gradeClauseAgainstRule(clause.text, rule);
    if (g.grade === "STANDARD") {
      // Their edit stayed on our standard position — informational, no action.
      findings.push({
        clauseAnchorId: clause.anchorId, clauseType: clause.clauseType, grade: "STANDARD", editKind: "NONE",
        ourPosition: b.text, theirPosition: clause.text,
        rationale: "Counterparty edited our clause but it remains on our standard position.",
        suggestedText: null, playbookRuleId: rule.id, severity: 0, orderIndex: order++,
      });
      continue;
    }
    const fb = g.fallbackIndex != null ? rule.fallbackTexts[g.fallbackIndex] : undefined;
    findings.push({
      clauseAnchorId: clause.anchorId, clauseType: clause.clauseType, grade: g.grade, editKind: "REPLACEMENT",
      ourPosition: b.text, theirPosition: clause.text,
      rationale: g.grade === "ESCALATE"
        ? `Counterparty's edit moves our clause off-playbook. ${rule.escalationTrigger ?? rule.guidance ?? ""}`.trim()
        : `Counterparty's edit lands at an acceptable fallback, not our sent language. ${rule.guidance ?? ""}`.trim(),
      // In our-paper mode the natural counter is to revert to what we sent (or
      // our fallback if theirs is an acceptable landing zone).
      suggestedText: g.grade === "FALLBACK" && fb ? fb : b.text, playbookRuleId: rule.id,
      severity: gradeSeverity(g.grade, rule.severityWeight), orderIndex: order++,
    });
  }

  // ── They deleted a clause we had in our paper ───────────────────────
  for (const [key, b] of base) {
    if (cur.has(key)) continue;
    const rule = rulesByType.get(b.clauseType);
    const required = rule?.required ?? false;
    findings.push({
      clauseAnchorId: null, clauseType: b.clauseType, grade: required ? "MISSING" : "FALLBACK", editKind: "INSERTION",
      ourPosition: b.text, theirPosition: null,
      rationale: required
        ? `Counterparty deleted a required clause from our paper. ${rule?.guidance ?? ""}`.trim()
        : "Counterparty deleted our clause — re-insert our sent language unless the deletion is agreed.",
      suggestedText: b.text, playbookRuleId: rule?.id ?? null,
      severity: gradeSeverity(required ? "MISSING" : "FALLBACK", rule?.severityWeight ?? 1), orderIndex: order++,
    });
  }

  return findings;
}

export function summarizeFindings(findings: BuiltFinding[]): ReviewSummary {
  const counts = { standard: 0, fallback: 0, escalate: 0, missing: 0 };
  let totalWeight = 0;
  let acceptableWeight = 0;
  for (const f of findings) {
    if (f.grade === "STANDARD") counts.standard++;
    else if (f.grade === "FALLBACK") counts.fallback++;
    else if (f.grade === "ESCALATE") counts.escalate++;
    else if (f.grade === "MISSING") counts.missing++;
    // Weight only the gradeable findings (those with a playbook rule).
    if (f.playbookRuleId) {
      const w = Math.max(1, f.severity || 1);
      totalWeight += w;
      if (f.grade === "STANDARD" || f.grade === "FALLBACK") acceptableWeight += w;
    }
  }
  const total = findings.length;
  const weightedScore = totalWeight === 0 ? 100 : Math.round((acceptableWeight / totalWeight) * 100);
  const riskBand: ReviewSummary["riskBand"] = counts.escalate + counts.missing > 0 ? "HIGH" : counts.fallback > 0 ? "MEDIUM" : "LOW";
  const verdict = counts.escalate + counts.missing > 0
    ? `${counts.escalate + counts.missing} issue(s) off-playbook or missing — redline before signing`
    : counts.fallback > 0
    ? `${counts.fallback} clause(s) at fallback — acceptable with review`
    : "On our positions — low risk";
  return { ...counts, total, weightedScore, verdict, riskBand };
}

// ── DTOs ──────────────────────────────────────────────────────────────

export interface ReviewFindingDTO {
  id: string;
  clauseAnchorId: string | null;
  clauseType: string;
  grade: ReviewGradeT;
  editKind: EditKindT;
  ourPosition: string | null;
  theirPosition: string | null;
  rationale: string | null;
  suggestedText: string | null;
  severity: number;
  decision: DecisionT;
  orderIndex: number;
}

export interface ContractReviewDTO {
  id: string;
  contractId: string;
  playbookId: string | null;
  playbookVersion: number | null;
  paperType: ReviewPaperType;
  perspective: ContractPerspective | null;
  status: "IN_PROGRESS" | "READY" | "APPLIED" | "EXPORTED";
  verdict: string | null;
  riskBand: string | null;
  summary: ReviewSummary | null;
  appliedVersionId: string | null;
  createdAt: string;
  findings?: ReviewFindingDTO[];
}

function findingToDTO(f: {
  id: string; clauseAnchorId: string | null; clauseType: string; grade: ReviewGradeT; editKind: EditKindT;
  ourPosition: string | null; theirPosition: string | null; rationale: string | null; suggestedText: string | null;
  severity: number; decision: DecisionT; orderIndex: number;
}): ReviewFindingDTO {
  return {
    id: f.id, clauseAnchorId: f.clauseAnchorId, clauseType: f.clauseType, grade: f.grade, editKind: f.editKind,
    ourPosition: f.ourPosition, theirPosition: f.theirPosition, rationale: f.rationale, suggestedText: f.suggestedText,
    severity: f.severity, decision: f.decision, orderIndex: f.orderIndex,
  };
}

// ── DB service ────────────────────────────────────────────────────────

/**
 * Start a graded review of a contract's paper. Grades its clauses against the
 * published playbook (creating a default one from the clause library if none
 * is published), persists the review + findings, and writes a PENDING
 * AgentDecision per actionable finding. Returns the review with findings.
 */
export async function startContractReview(
  organizationId: string,
  contractId: string,
  opts: { paperType?: ReviewPaperType; perspective?: ContractPerspective | null },
  actor: Actor,
): Promise<ContractReviewDTO> {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, organizationId },
    select: { id: true, type: true, perspective: true, clauses: { select: { anchorId: true, type: true, text: true } } },
  });
  if (!contract) throw new Error("Contract not found");
  if (contract.clauses.length === 0) throw new Error("No extracted clauses to review — extract the contract first");

  const perspective = opts.perspective ?? contract.perspective ?? null;
  let playbook: ContractPlaybookDTO | null = await getPlaybookForContract(organizationId, { contractType: contract.type, perspective });
  if (!playbook) playbook = await ensureDefaultPlaybook(organizationId, actor);
  const rules = playbook?.rules ?? [];
  const paperType: ReviewPaperType = opts.paperType ?? "THEIR_PAPER";
  const liveClauses = contract.clauses.map((c) => ({ anchorId: c.anchorId, clauseType: c.type, text: c.text }));

  let built: BuiltFinding[];
  let baselineVersion: number | null = null;
  if (paperType === "OUR_PAPER_THEIR_MARKS") {
    // Our last-authored version is the baseline their marks are diffed against.
    const baseVer = await prisma.contractVersion.findFirst({
      where: { contractId, organizationId, source: { not: "COUNTERPARTY" } },
      orderBy: { version: "desc" },
      select: { version: true, clausesJson: true },
    });
    if (baseVer) {
      baselineVersion = baseVer.version;
      const baseline = ((baseVer.clausesJson as unknown as { type: string; text: string }[]) ?? [])
        .map((c) => ({ clauseType: c.type, text: c.text }));
      built = buildDeltaReviewFindings(baseline, liveClauses, rules);
    } else {
      // No sent baseline on file — fall back to grading each clause in isolation.
      built = buildReviewFindings(liveClauses, rules);
    }
  } else {
    built = buildReviewFindings(liveClauses, rules);
  }
  const summary = { ...summarizeFindings(built), baselineVersion };

  const review = await prisma.contractReview.create({
    data: {
      organizationId, contractId,
      playbookId: playbook?.id ?? null, playbookVersion: playbook?.version ?? null,
      paperType, perspective,
      status: "IN_PROGRESS", verdict: summary.verdict, riskBand: summary.riskBand,
      severitySummaryJson: summary as never, createdById: actor.id,
    },
  });

  // Persist findings; actionable ones (not STANDARD) get a PENDING gate.
  for (const f of built) {
    let agentDecisionId: string | null = null;
    if (f.grade !== "STANDARD") {
      const promptHash = sha256Hex(`${review.id}:${f.clauseType}:${f.clauseAnchorId ?? "MISSING"}:${f.suggestedText ?? ""}`);
      const d = await prisma.agentDecision.create({
        data: {
          organizationId, resourceType: RESOURCE_TYPE, resourceId: review.id,
          agentName: AGENT_NAME, modelId: CLAUDE_MODEL, modelVersion: "deterministic-playbook",
          promptHash, recommendationJson: { reviewId: review.id, clauseType: f.clauseType, grade: f.grade, suggestedText: f.suggestedText } as never,
          confidence: null, approvalStatus: AgentApprovalStatus.PENDING,
        },
      });
      agentDecisionId = d.id;
    }
    await prisma.reviewFinding.create({
      data: {
        organizationId, reviewId: review.id, clauseAnchorId: f.clauseAnchorId, clauseType: f.clauseType,
        grade: f.grade, editKind: f.editKind, ourPosition: f.ourPosition, theirPosition: f.theirPosition,
        rationale: f.rationale, suggestedText: f.suggestedText, playbookRuleId: f.playbookRuleId,
        severity: f.severity, decision: "PENDING", agentDecisionId, orderIndex: f.orderIndex,
      },
    });
  }

  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "contract.review.started", resourceType: "ContractReview", resourceId: review.id,
    afterJson: { contractId, paperType: review.paperType, playbookId: playbook?.id, ...summary } as never,
    metadata: { source: "contracts", agent: AGENT_NAME } as never,
  });

  return getContractReview(organizationId, review.id) as Promise<ContractReviewDTO>;
}

export async function getContractReview(organizationId: string, reviewId: string): Promise<ContractReviewDTO | null> {
  const r = await prisma.contractReview.findFirst({
    where: { id: reviewId, organizationId },
    include: { findings: { orderBy: { orderIndex: "asc" } } },
  });
  if (!r) return null;
  return {
    id: r.id, contractId: r.contractId, playbookId: r.playbookId, playbookVersion: r.playbookVersion,
    paperType: r.paperType, perspective: r.perspective, status: r.status, verdict: r.verdict, riskBand: r.riskBand,
    summary: (r.severitySummaryJson as unknown as ReviewSummary) ?? null,
    appliedVersionId: r.appliedVersionId, createdAt: r.createdAt.toISOString(),
    findings: r.findings.map((f) => findingToDTO(f as never)),
  };
}

export async function listContractReviews(organizationId: string, contractId: string): Promise<ContractReviewDTO[]> {
  const rows = await prisma.contractReview.findMany({
    where: { organizationId, contractId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id, contractId: r.contractId, playbookId: r.playbookId, playbookVersion: r.playbookVersion,
    paperType: r.paperType, perspective: r.perspective, status: r.status, verdict: r.verdict, riskBand: r.riskBand,
    summary: (r.severitySummaryJson as unknown as ReviewSummary) ?? null,
    appliedVersionId: r.appliedVersionId, createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Record the human verdict on a finding (the gate). ACCEPT applies on apply;
 * REJECT drops it; EDIT accepts an operator-edited replacement. Updates the
 * linked AgentDecision and chain-seals the decision.
 */
export async function decideFinding(
  organizationId: string,
  findingId: string,
  verdict: "accept" | "reject" | "edit",
  actor: Actor,
  opts?: { editedText?: string | null },
): Promise<ReviewFindingDTO> {
  const finding = await prisma.reviewFinding.findFirst({ where: { id: findingId, organizationId } });
  if (!finding) throw new Error("Finding not found");
  if (finding.grade === "STANDARD") throw new Error("Standard clauses have no decision");

  const decision: DecisionT = verdict === "reject" ? "REJECTED" : verdict === "edit" ? "EDITED" : "ACCEPTED";
  const editedText = verdict === "edit" ? (opts?.editedText?.trim() || finding.suggestedText) : finding.suggestedText;

  const updated = await prisma.reviewFinding.update({
    where: { id: findingId },
    data: {
      decision, decidedById: actor.id, decidedAt: new Date(),
      ...(verdict === "edit" ? { suggestedText: editedText } : {}),
    },
  });

  // Reflect on the gate.
  if (finding.agentDecisionId) {
    const status = verdict === "reject" ? AgentApprovalStatus.REJECTED
      : verdict === "edit" ? AgentApprovalStatus.APPROVED_WITH_OVERRIDE : AgentApprovalStatus.APPROVED;
    await prisma.agentDecision.updateMany({
      where: { id: finding.agentDecisionId, organizationId, approvalStatus: AgentApprovalStatus.PENDING },
      data: { approvalStatus: status, approvedById: actor.id, approvedAt: new Date(), overrideReason: verdict === "edit" ? "Reviewer edited the suggested language." : null },
    });
  }

  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "contract.review.finding.decided", resourceType: RESOURCE_TYPE, resourceId: findingId,
    afterJson: { reviewId: finding.reviewId, grade: finding.grade, decision } as never,
    metadata: { source: "contracts", agent: AGENT_NAME } as never,
  });

  // If no PENDING findings remain, mark the review READY.
  const pending = await prisma.reviewFinding.count({ where: { reviewId: finding.reviewId, decision: "PENDING", grade: { not: "STANDARD" } } });
  if (pending === 0) {
    await prisma.contractReview.updateMany({ where: { id: finding.reviewId, status: "IN_PROGRESS" }, data: { status: "READY" } });
  }

  return findingToDTO(updated as never);
}

/**
 * Apply the accepted/edited findings into a new chain-sealed ContractVersion —
 * the marked-up document. REPLACEMENT updates the clause by anchorId;
 * INSERTION adds our missing clause; DELETION removes it. Only ACCEPTED /
 * EDITED findings apply; the rest are left as their paper had them.
 */
export async function applyContractReview(organizationId: string, reviewId: string, actor: Actor): Promise<ContractReviewDTO> {
  const review = await prisma.contractReview.findFirst({
    where: { id: reviewId, organizationId },
    include: { findings: true },
  });
  if (!review) throw new Error("Review not found");
  if (review.status === "APPLIED" || review.status === "EXPORTED") throw new Error("This review has already been applied");

  const toApply = review.findings.filter((f) => f.decision === "ACCEPTED" || f.decision === "EDITED");
  if (toApply.length === 0) throw new Error("No accepted findings to apply");

  let replaced = 0, inserted = 0, deleted = 0;
  for (const f of toApply) {
    if (f.editKind === "REPLACEMENT" && f.clauseAnchorId && f.suggestedText) {
      const res = await prisma.contractClause.updateMany({
        where: { anchorId: f.clauseAnchorId, contractId: review.contractId },
        data: { text: f.suggestedText, deviation: false, summary: `Redlined to our ${f.grade === "ESCALATE" ? "preferred" : "acceptable"} position (review).` },
      });
      replaced += res.count;
    } else if (f.editKind === "INSERTION" && f.suggestedText) {
      await prisma.contractClause.create({
        data: { contractId: review.contractId, type: f.clauseType, text: f.suggestedText, deviation: false, summary: "Inserted missing required clause (review)." },
      });
      inserted++;
    } else if (f.editKind === "DELETION" && f.clauseAnchorId) {
      const res = await prisma.contractClause.deleteMany({ where: { anchorId: f.clauseAnchorId, contractId: review.contractId } });
      deleted += res.count;
    }
  }

  const snap = await snapshotContractVersion(
    organizationId, review.contractId,
    { label: `Review redline (${replaced} replaced · ${inserted} inserted · ${deleted} removed)`, source: "COUNTERPARTY" },
    actor,
  );

  await prisma.contractReview.update({
    where: { id: reviewId },
    data: { status: "APPLIED", appliedVersionId: snap?.id ?? null },
  });

  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "contract.review.applied", resourceType: "ContractReview", resourceId: reviewId,
    afterJson: { contractId: review.contractId, replaced, inserted, deleted, versionId: snap?.id } as never,
    metadata: { source: "contracts", agent: AGENT_NAME } as never,
  });

  return getContractReview(organizationId, reviewId) as Promise<ContractReviewDTO>;
}
