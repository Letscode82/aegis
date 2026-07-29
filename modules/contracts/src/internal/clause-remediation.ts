/**
 * AI clause remediation (CLM Phase 5b).
 *
 * "I can see the high-risk clauses — now what?" This proposes a fix for a
 * deviating / high-risk clause, drawing on three sources:
 *   1. the PLAYBOOK — the Clause Library already stores standard + fallback
 *      + guidance per clause type (deterministic, always available),
 *   2. AGREEABLE PRECEDENT — prior NON-deviating clauses of the same type
 *      from other contracts in the org (what your side has actually agreed
 *      to before), and
 *   3. an AI-drafted redline that blends the above into a concrete
 *      replacement.
 *
 * Human-gated exactly like the Phase 3b change-narrative: generating a
 * suggestion writes a PENDING AgentDecision; the reviewer accepts (optionally
 * choosing one of the surfaced options instead of the AI draft) or rejects.
 * Accepting APPLIES the replacement to the clause, marks it non-deviating,
 * downgrades its risk one level, and snapshots a new version — all chain-
 * sealed. Nothing is applied without the accept keystroke.
 *
 * Server-only — imports @aegis/db + @aegis/ai/server.
 */
import {
  prisma,
  logAudit,
  sha256Hex,
  AgentApprovalStatus,
  type AgentDecision,
} from "@aegis/db";
import { CLAUDE_MODEL, callClaudeJSON } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";
import { getClauseLibraryByType } from "./clause-library";
import { snapshotContractVersion } from "./versions";

const RESOURCE_TYPE = "ContractClause";
const AGENT_NAME = "contract-clause-remediator";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };
type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type RemediationBasis = "playbook" | "precedent" | "blend" | "none";
export type RemediationStatus = "PENDING" | "APPROVED" | "APPROVED_WITH_OVERRIDE" | "REJECTED" | "AUTO_REJECTED";

export interface RemediationOption {
  source: "playbook-standard" | "playbook-fallback" | "precedent";
  label: string;
  text: string;
}

export interface ClauseRemediationDTO {
  id: string;
  status: RemediationStatus;
  clauseId: string;
  clauseType: string;
  currentText: string;
  suggestedText: string;
  rationale: string;
  basis: RemediationBasis;
  options: RemediationOption[];
  confidence: number | null;
  degraded: boolean;
  approvedByName: string | null;
  appliedText: string | null;
  createdAt: string;
}

// ── Pure helper (unit-tested; no DB, no AI) ──────────────────────────

const RISK_DOWN: Record<RiskLevel, RiskLevel> = { HIGH: "MEDIUM", MEDIUM: "LOW", LOW: "LOW" };

/** Build the Claude prompt from the clause + playbook + precedents. Pure. */
export function buildRemediationPrompt(
  clause: { type: string; text: string; risk: string },
  playbook: { standardText?: string | null; fallbackText?: string | null; guidance?: string | null } | null,
  precedents: string[],
): string {
  return [
    `You are a contracts attorney fixing a clause that deviates from your side's playbook.`,
    `Clause type: ${clause.type.replace(/_/g, " ")} (current risk ${clause.risk}).`,
    `Current (problematic) language:\n"${clause.text}"`,
    "",
    playbook?.standardText ? `Playbook STANDARD position:\n"${playbook.standardText}"` : "No playbook standard on file.",
    playbook?.fallbackText ? `Playbook acceptable FALLBACK:\n"${playbook.fallbackText}"` : "",
    playbook?.guidance ? `Reviewer guidance: ${playbook.guidance}` : "",
    precedents.length ? `Language your side has AGREED TO before (precedent):\n${precedents.map((p, i) => `${i + 1}. "${p}"`).join("\n")}` : "No agreeable precedent found.",
    "",
    "Propose a concrete replacement that pulls the clause back to an acceptable position. Prefer the playbook standard; use the fallback or precedent when the standard is unrealistic. Respond with STRICT JSON only:",
    `{`,
    `  "suggestedText": "the replacement clause language",`,
    `  "rationale": "1-2 sentences: why this fixes the deviation and what leverage it restores",`,
    `  "basis": "playbook | precedent | blend",`,
    `  "confidence": 0.0-1.0`,
    `}`,
    "Do not weaken your side's position below the fallback. Be concrete.",
  ].filter(Boolean).join("\n");
}

// ── DB service ───────────────────────────────────────────────────────

function toDTO(d: AgentDecision, approvedByName: string | null): ClauseRemediationDTO {
  const rec = (d.recommendationJson ?? {}) as Record<string, unknown>;
  return {
    id: d.id,
    status: d.approvalStatus as RemediationStatus,
    clauseId: String(rec.clauseId ?? ""),
    clauseType: String(rec.clauseType ?? ""),
    currentText: String(rec.currentText ?? ""),
    suggestedText: String(rec.suggestedText ?? ""),
    rationale: String(rec.rationale ?? ""),
    basis: (rec.basis as RemediationBasis) ?? "none",
    options: Array.isArray(rec.options) ? (rec.options as RemediationOption[]) : [],
    confidence: d.confidence ?? null,
    degraded: rec.degraded === true,
    approvedByName,
    appliedText: rec.appliedText ? String(rec.appliedText) : null,
    createdAt: d.createdAt.toISOString(),
  };
}

async function resolveApproverName(id: string | null): Promise<string | null> {
  if (!id) return null;
  const u = await prisma.user.findUnique({ where: { id }, select: { name: true } });
  return u?.name ?? null;
}

async function latestForClause(organizationId: string, clauseId: string): Promise<AgentDecision | null> {
  return prisma.agentDecision.findFirst({
    where: { organizationId, agentName: AGENT_NAME, resourceType: RESOURCE_TYPE, resourceId: clauseId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getClauseRemediation(organizationId: string, clauseId: string): Promise<ClauseRemediationDTO | null> {
  const d = await latestForClause(organizationId, clauseId);
  if (!d) return null;
  return toDTO(d, await resolveApproverName(d.approvedById));
}

/** Gather agreeable precedent — prior non-deviating clauses of the same type
 *  from OTHER contracts in the org. Deduped by text, capped. */
async function agreeablePrecedents(organizationId: string, clauseType: string, contractId: string): Promise<string[]> {
  const rows = await prisma.contractClause.findMany({
    where: { type: clauseType, deviation: false, contractId: { not: contractId }, contract: { organizationId } },
    select: { text: true },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const t = r.text.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * Generate (or refresh) a remediation suggestion for a clause and persist it
 * as a PENDING AgentDecision. Degrades to the playbook standard/fallback when
 * Claude is unavailable.
 */
export async function suggestClauseRemediation(
  organizationId: string,
  contractId: string,
  clauseId: string,
  actor: Actor,
): Promise<ClauseRemediationDTO> {
  const clause = await prisma.contractClause.findFirst({
    where: { id: clauseId, contractId, contract: { organizationId } },
    select: { id: true, type: true, text: true, risk: true },
  });
  if (!clause) throw new Error("Clause not found");

  const playbookMap = await getClauseLibraryByType(organizationId);
  const pb = playbookMap[clause.type] ?? null;
  const precedents = await agreeablePrecedents(organizationId, clause.type, contractId);

  const options: RemediationOption[] = [];
  if (pb?.standardText) options.push({ source: "playbook-standard", label: "Playbook standard", text: pb.standardText });
  if (pb?.fallbackText) options.push({ source: "playbook-fallback", label: "Playbook fallback", text: pb.fallbackText });
  precedents.forEach((p) => options.push({ source: "precedent", label: "Agreeable precedent", text: p }));

  // Deterministic fallback: prefer standard, then fallback, then precedent.
  const fallbackText = pb?.standardText || pb?.fallbackText || precedents[0] || clause.text;
  const fallbackBasis: RemediationBasis = pb?.standardText || pb?.fallbackText ? "playbook" : precedents[0] ? "precedent" : "none";
  const fallbackRationale = pb?.guidance || (fallbackBasis === "playbook"
    ? "Replace with the playbook position to remove the deviation."
    : fallbackBasis === "precedent"
    ? "Replace with language your side has agreed to before."
    : "No playbook or precedent on file — draft a replacement manually.");

  let suggestedText = fallbackText;
  let rationale = fallbackRationale;
  let basis: RemediationBasis = fallbackBasis;
  let confidence: number | null = null;
  let degraded = true;

  const prompt = buildRemediationPrompt(clause, pb, precedents);
  try {
    ensureServerClaudeTransport();
    const r = (await callClaudeJSON(prompt, { maxTokens: 900, timeout: 45000 })) as Record<string, unknown>;
    if (r && typeof r.suggestedText === "string" && r.suggestedText.trim()) {
      suggestedText = String(r.suggestedText).trim();
      rationale = String(r.rationale ?? fallbackRationale).trim();
      const b = String(r.basis ?? "").toLowerCase();
      basis = (["playbook", "precedent", "blend"].includes(b) ? b : fallbackBasis) as RemediationBasis;
      const c = Number(r.confidence);
      confidence = Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : null;
      degraded = false;
    }
  } catch (e) {
    console.error("[contract-clause-remediator] callClaudeJSON failed, using deterministic fallback:", e);
  }

  const recommendationJson = {
    contractId, clauseId, clauseType: clause.type, currentText: clause.text, currentRisk: clause.risk,
    suggestedText, rationale, basis, options, degraded,
  };
  const promptHash = sha256Hex(prompt);

  const existing = await latestForClause(organizationId, clauseId);
  let decision: AgentDecision;
  if (existing && existing.approvalStatus === AgentApprovalStatus.PENDING) {
    decision = await prisma.agentDecision.update({
      where: { id: existing.id },
      data: { modelVersion: degraded ? "degraded-fallback" : "live", promptHash, recommendationJson: recommendationJson as never, confidence },
    });
  } else {
    decision = await prisma.agentDecision.create({
      data: {
        organizationId, resourceType: RESOURCE_TYPE, resourceId: clauseId,
        agentName: AGENT_NAME, modelId: CLAUDE_MODEL,
        modelVersion: degraded ? "degraded-fallback" : "live", promptHash,
        recommendationJson: recommendationJson as never, confidence,
        approvalStatus: AgentApprovalStatus.PENDING,
      },
    });
  }

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
    action: "contract.clause.remediation_suggested",
    resourceType: RESOURCE_TYPE,
    resourceId: clauseId,
    afterJson: { contractId, clauseType: clause.type, basis, degraded } as never,
    metadata: { source: "contracts", agent: AGENT_NAME } as never,
  });

  return toDTO(decision, null);
}

/**
 * Resolve a pending remediation. Approve APPLIES the replacement to the
 * clause (optionally an operator-chosen option instead of the AI draft),
 * marks it non-deviating, downgrades risk one level, and snapshots a new
 * version. Reject records the verdict. The accept is the only path that
 * mutates the clause; chain-sealed either way.
 */
export async function resolveClauseRemediation(
  organizationId: string,
  contractId: string,
  decisionId: string,
  action: "approve" | "reject",
  actor: Actor,
  opts?: { chosenText?: string | null },
): Promise<ClauseRemediationDTO> {
  const decision = await prisma.agentDecision.findFirst({
    where: { id: decisionId, organizationId, resourceType: RESOURCE_TYPE, agentName: AGENT_NAME },
  });
  if (!decision) throw new Error("Remediation decision not found");
  if (decision.approvalStatus !== AgentApprovalStatus.PENDING) {
    throw new Error("This remediation has already been resolved — the verdict is immutable.");
  }
  const rec = (decision.recommendationJson ?? {}) as Record<string, unknown>;
  const clauseId = String(rec.clauseId ?? decision.resourceId);

  if (action === "reject") {
    const auditId = await logAudit({
      organizationId, actorId: actor.id, actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
      action: "contract.clause.remediation_rejected",
      resourceType: RESOURCE_TYPE, resourceId: clauseId,
      afterJson: { contractId, clauseType: rec.clauseType } as never,
      metadata: { source: "contracts", agent: AGENT_NAME } as never,
    });
    const updated = await prisma.agentDecision.update({
      where: { id: decision.id },
      data: { approvalStatus: AgentApprovalStatus.REJECTED, approvedAt: new Date(), resultingAuditLogId: auditId },
    });
    return toDTO(updated, null);
  }

  // Approve → apply the replacement to the clause.
  const appliedText = (opts?.chosenText && opts.chosenText.trim()) || String(rec.suggestedText ?? "");
  const overrode = !!(opts?.chosenText && opts.chosenText.trim() && opts.chosenText.trim() !== String(rec.suggestedText ?? "").trim());
  if (!appliedText.trim()) throw new Error("No replacement text to apply");

  const clause = await prisma.contractClause.findFirst({
    where: { id: clauseId, contractId, contract: { organizationId } },
    select: { id: true, type: true, risk: true, text: true },
  });
  if (!clause) throw new Error("Clause no longer exists");

  const newRisk = RISK_DOWN[(clause.risk as RiskLevel)] ?? "LOW";
  await prisma.contractClause.update({
    where: { id: clause.id },
    data: {
      text: appliedText,
      deviation: false,
      risk: newRisk,
      summary: `Remediated to ${String(rec.basis) === "precedent" ? "agreed precedent" : "playbook position"} (was ${clause.risk}${" · deviating"}).`,
    },
  });

  const auditId = await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
    action: "contract.clause.remediation_applied",
    resourceType: RESOURCE_TYPE, resourceId: clause.id,
    beforeJson: { text: clause.text, risk: clause.risk, deviation: true } as never,
    afterJson: { text: appliedText, risk: newRisk, deviation: false, basis: rec.basis, overrode } as never,
    metadata: { source: "contracts", agent: AGENT_NAME, contractId } as never,
  });

  // Snapshot the remediated clause set so the redline shows the fix.
  try {
    await snapshotContractVersion(organizationId, contractId, { label: `Clause remediation: ${clause.type.replace(/_/g, " ")}`, source: "MANUAL" }, actor);
  } catch { /* snapshot is non-critical */ }

  const updated = await prisma.agentDecision.update({
    where: { id: decision.id },
    data: {
      approvalStatus: overrode ? AgentApprovalStatus.APPROVED_WITH_OVERRIDE : AgentApprovalStatus.APPROVED,
      approvedById: actor.id ?? null,
      approvedAt: new Date(),
      resultingAuditLogId: auditId,
      overrideReason: overrode ? "Reviewer chose a different option than the AI draft." : null,
      recommendationJson: { ...rec, appliedText } as never,
    },
  });
  return toDTO(updated, await resolveApproverName(updated.approvedById));
}
