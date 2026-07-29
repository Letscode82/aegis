/**
 * AI change-narrative on a version redline (CLM Phase 3b — the AgentDecision
 * lifecycle goes live for the Contracts module).
 *
 * A redline (diffContractVersions) tells you *what* changed, clause by
 * clause. This asks Claude to explain *why it matters* — a plain-language
 * summary of the amendment plus a directional risk read against the
 * playbook. It is the first live @aegis/ai call in Contracts.
 *
 * Conservative-AI governance (non-negotiable, same as intake P2b):
 *   1. Generating a narrative writes a PENDING `AgentDecision` row — the
 *      AI output is a *recommendation*, not an accepted artifact.
 *   2. The reviewer's approve action is the ONLY path to APPROVED. Until
 *      then the summary renders as "pending review", never as fact.
 *   3. Approve / reject writes a chain-sealed AuditLog row and links it
 *      back onto the decision (`resultingAuditLogId`) as the evidence
 *      anchor — mirroring `syncAgentDecisionForTicket`.
 *
 * Advisory by construction: the narrative mutates NO contract state, so
 * even an approved narrative only records "a human accepted this AI
 * summary". The gate is exercised end-to-end without ever letting the
 * model touch the contract record.
 *
 * The decision attaches via the polymorphic pair
 * (resourceType="Contract", resourceId=contractId); the governed
 * version-pair lives in `recommendationJson.{fromVersion,toVersion}`.
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
import { diffContractVersions, type ContractDiff, type ClauseChange } from "./versions";

const RESOURCE_TYPE = "Contract";
const AGENT_NAME = "contract-change-narrator";

export type NarrativeRisk = "LOWER" | "HIGHER" | "MIXED" | "UNCHANGED";
export type NarrativeStatus =
  | "PENDING"
  | "APPROVED"
  | "APPROVED_WITH_OVERRIDE"
  | "REJECTED"
  | "AUTO_REJECTED";

export interface ChangeNarrativeDTO {
  id: string;
  status: NarrativeStatus;
  fromVersion: number;
  toVersion: number;
  headline: string;
  narrative: string;
  riskAssessment: NarrativeRisk;
  keyPoints: string[];
  confidence: number | null;
  /** true when Claude was unavailable and the deterministic fallback ran. */
  degraded: boolean;
  approvedByName: string | null;
  createdAt: string;
}

// ── Pure helpers (unit-tested; no DB, no AI) ─────────────────────────

const RISK_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

export interface DiffSummary {
  added: number;
  removed: number;
  changed: number;
  /** deviating clauses newly introduced (added deviating OR flipped to deviating). */
  deviationsIntroduced: number;
  /** deviating clauses resolved (removed deviating OR flipped off deviation). */
  deviationsResolved: number;
  riskUp: number;
  riskDown: number;
}

/** Roll a clause-change list into the directional counts the prompt and the
 *  deterministic fallback both read. Pure. */
export function summarizeDiff(changes: ClauseChange[]): DiffSummary {
  let added = 0, removed = 0, changed = 0;
  let deviationsIntroduced = 0, deviationsResolved = 0, riskUp = 0, riskDown = 0;
  for (const c of changes) {
    if (c.kind === "added") {
      added++;
      if (c.to.deviation) deviationsIntroduced++;
    } else if (c.kind === "removed") {
      removed++;
      if (c.from.deviation) deviationsResolved++;
    } else {
      changed++;
      if (!c.from.deviation && c.to.deviation) deviationsIntroduced++;
      if (c.from.deviation && !c.to.deviation) deviationsResolved++;
      const dr = (RISK_RANK[c.to.risk] ?? 0) - (RISK_RANK[c.from.risk] ?? 0);
      if (dr > 0) riskUp++;
      if (dr < 0) riskDown++;
    }
  }
  return { added, removed, changed, deviationsIntroduced, deviationsResolved, riskUp, riskDown };
}

/** Directional risk read from the summary. Pure. */
export function assessRisk(s: DiffSummary): NarrativeRisk {
  const up = s.deviationsIntroduced + s.riskUp;
  const down = s.deviationsResolved + s.riskDown;
  if (up === 0 && down === 0) return "UNCHANGED";
  if (up > 0 && down > 0) return "MIXED";
  return up > 0 ? "HIGHER" : "LOWER";
}

const clauseLabel = (t: string) => t.replace(/_/g, " ").toLowerCase();

/**
 * Deterministic fallback narrative — runs when Claude is unavailable so the
 * feature never hard-fails (same posture as the regex intake classifier).
 * Marked `degraded` on the decision so the evidence shows no model ran. Pure.
 */
export function deterministicNarrative(diff: ContractDiff): {
  headline: string;
  narrative: string;
  riskAssessment: NarrativeRisk;
  keyPoints: string[];
} {
  const s = summarizeDiff(diff.changes);
  const risk = assessRisk(s);
  const parts: string[] = [];
  if (s.added) parts.push(`${s.added} clause${s.added === 1 ? "" : "s"} added`);
  if (s.removed) parts.push(`${s.removed} removed`);
  if (s.changed) parts.push(`${s.changed} amended`);
  const headline = parts.length
    ? `v${diff.fromVersion} → v${diff.toVersion}: ${parts.join(", ")}`
    : `v${diff.fromVersion} → v${diff.toVersion}: no clause-level change`;

  const keyPoints: string[] = [];
  for (const c of diff.changes) {
    if (c.kind === "added")
      keyPoints.push(`Added ${clauseLabel(c.type)}${c.to.deviation ? " — deviates from playbook" : ""}.`);
    else if (c.kind === "removed")
      keyPoints.push(`Removed ${clauseLabel(c.type)}${c.from.deviation ? " — resolved a prior deviation" : ""}.`);
    else {
      const bits = c.fields.filter((f) => f !== "summary");
      const riskNote =
        (RISK_RANK[c.to.risk] ?? 0) > (RISK_RANK[c.from.risk] ?? 0)
          ? ` (risk ${c.from.risk}→${c.to.risk})`
          : (RISK_RANK[c.to.risk] ?? 0) < (RISK_RANK[c.from.risk] ?? 0)
          ? ` (risk ${c.from.risk}→${c.to.risk})`
          : "";
      keyPoints.push(`Amended ${clauseLabel(c.type)} — ${bits.join(", ") || "wording"}${riskNote}.`);
    }
  }

  const riskSentence =
    risk === "HIGHER"
      ? "On balance the amendment increases risk exposure against the playbook — review the introduced deviations before approving."
      : risk === "LOWER"
      ? "On balance the amendment reduces risk against the playbook."
      : risk === "MIXED"
      ? "The amendment cuts both ways — some terms improved, others regressed against the playbook."
      : "No net change to playbook risk posture.";
  const narrative = keyPoints.length
    ? `${keyPoints.join(" ")} ${riskSentence}`
    : `No clause-level differences between v${diff.fromVersion} and v${diff.toVersion}. ${riskSentence}`;

  return { headline, narrative, riskAssessment: risk, keyPoints: keyPoints.slice(0, 8) };
}

/** The Claude prompt. Pure — kept separate so the shape is unit-testable. */
export function buildNarrativePrompt(diff: ContractDiff, contractTitle: string): string {
  const lines = diff.changes.map((c) => {
    if (c.kind === "added")
      return `ADDED ${c.type} [risk ${c.to.risk}${c.to.deviation ? ", DEVIATES" : ""}]: ${c.to.text}`;
    if (c.kind === "removed")
      return `REMOVED ${c.type} [was risk ${c.from.risk}${c.from.deviation ? ", DEVIATED" : ""}]: ${c.from.text}`;
    return `CHANGED ${c.type} [${c.from.risk}${c.from.deviation ? "/dev" : ""} → ${c.to.risk}${c.to.deviation ? "/dev" : ""}] fields=${c.fields.join(",")}\n  before: ${c.from.text}\n  after:  ${c.to.text}`;
  });
  return [
    `You are a contracts attorney reviewing a redline between two versions of "${contractTitle}".`,
    `Version ${diff.fromVersion} → version ${diff.toVersion}. Clause-level changes (against the AEGIS playbook):`,
    "",
    lines.join("\n"),
    "",
    "Write a concise change summary for the reviewing General Counsel. Respond with STRICT JSON only:",
    `{`,
    `  "headline": "one line, <=90 chars, what changed at a glance",`,
    `  "narrative": "2-4 sentences: what changed and why it matters commercially/legally",`,
    `  "riskAssessment": "HIGHER | LOWER | MIXED | UNCHANGED (net risk vs the prior version)",`,
    `  "keyPoints": ["3-6 short bullets, each a specific material change"],`,
    `  "confidence": 0.0-1.0`,
    `}`,
    "Do not invent clauses that are not in the redline. Be precise and skeptical.",
  ].join("\n");
}

// ── DB service ───────────────────────────────────────────────────────

function toDTO(d: AgentDecision, approvedByName: string | null): ChangeNarrativeDTO {
  const rec = (d.recommendationJson ?? {}) as Record<string, unknown>;
  return {
    id: d.id,
    status: d.approvalStatus as NarrativeStatus,
    fromVersion: Number(rec.fromVersion ?? 0),
    toVersion: Number(rec.toVersion ?? 0),
    headline: String(rec.headline ?? ""),
    narrative: String(rec.narrative ?? ""),
    riskAssessment: (rec.riskAssessment as NarrativeRisk) ?? "UNCHANGED",
    keyPoints: Array.isArray(rec.keyPoints) ? (rec.keyPoints as string[]) : [],
    confidence: d.confidence ?? null,
    degraded: rec.degraded === true,
    approvedByName,
    createdAt: d.createdAt.toISOString(),
  };
}

async function resolveApproverName(approvedById: string | null): Promise<string | null> {
  if (!approvedById) return null;
  const u = await prisma.user.findUnique({ where: { id: approvedById }, select: { name: true } });
  return u?.name ?? null;
}

/** The latest decision governing this contract's (from,to) version pair. */
async function latestForPair(
  organizationId: string,
  contractId: string,
  fromVersion: number,
  toVersion: number,
): Promise<AgentDecision | null> {
  const rows = await prisma.agentDecision.findMany({
    where: { organizationId, agentName: AGENT_NAME, resourceType: RESOURCE_TYPE, resourceId: contractId },
    orderBy: { createdAt: "desc" },
  });
  return (
    rows.find((r) => {
      const rec = (r.recommendationJson ?? {}) as Record<string, unknown>;
      return Number(rec.fromVersion) === fromVersion && Number(rec.toVersion) === toVersion;
    }) ?? null
  );
}

/** Read the current narrative for a version pair (for panel render). */
export async function getChangeNarrative(
  organizationId: string,
  contractId: string,
  fromVersion: number,
  toVersion: number,
): Promise<ChangeNarrativeDTO | null> {
  const d = await latestForPair(organizationId, contractId, fromVersion, toVersion);
  if (!d) return null;
  return toDTO(d, await resolveApproverName(d.approvedById));
}

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

/**
 * Generate (or regenerate) the AI change-narrative for a version pair and
 * persist it as a PENDING AgentDecision. Never surfaces as approved — the
 * reviewer must approve it. Degrades to a deterministic narrative if Claude
 * is unavailable.
 *
 * If an unresolved (PENDING) decision already exists for the pair, its
 * content is refreshed in place; a resolved decision is immutable evidence,
 * so a fresh PENDING row supersedes it for display.
 */
export async function generateChangeNarrative(
  organizationId: string,
  contractId: string,
  fromVersion: number,
  toVersion: number,
  actor: Actor,
): Promise<ChangeNarrativeDTO> {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, organizationId },
    select: { id: true, title: true },
  });
  if (!contract) throw new Error("Contract not found");

  const diff = await diffContractVersions(organizationId, contractId, fromVersion, toVersion);
  if (!diff) throw new Error("One or both contract versions were not found");

  const prompt = buildNarrativePrompt(diff, contract.title);
  const fallback = deterministicNarrative(diff);

  let headline = fallback.headline;
  let narrative = fallback.narrative;
  let riskAssessment: NarrativeRisk = fallback.riskAssessment;
  let keyPoints = fallback.keyPoints;
  let confidence: number | null = null;
  let degraded = true;

  try {
    ensureServerClaudeTransport();
    const r = (await callClaudeJSON(prompt, { maxTokens: 900, timeout: 45000 })) as Record<string, unknown>;
    if (r && typeof r.narrative === "string" && r.narrative.trim()) {
      headline = String(r.headline ?? fallback.headline).slice(0, 120);
      narrative = String(r.narrative).trim();
      const ra = String(r.riskAssessment ?? "").toUpperCase();
      riskAssessment = (["HIGHER", "LOWER", "MIXED", "UNCHANGED"].includes(ra) ? ra : fallback.riskAssessment) as NarrativeRisk;
      keyPoints = Array.isArray(r.keyPoints)
        ? (r.keyPoints as unknown[]).map((x) => String(x)).filter(Boolean).slice(0, 8)
        : fallback.keyPoints;
      const c = Number(r.confidence);
      confidence = Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : null;
      degraded = false;
    }
  } catch (e) {
    // Claude unavailable → keep the deterministic fallback. Not fatal.
    console.error("[contract-change-narrator] callClaudeJSON failed, using deterministic fallback:", e);
  }

  const recommendationJson = {
    fromVersion, toVersion, headline, narrative, riskAssessment, keyPoints, degraded,
    changeCounts: diff.counts,
  };
  const promptHash = sha256Hex(prompt);

  const existing = await latestForPair(organizationId, contractId, fromVersion, toVersion);
  let decision: AgentDecision;
  if (existing && existing.approvalStatus === AgentApprovalStatus.PENDING) {
    decision = await prisma.agentDecision.update({
      where: { id: existing.id },
      data: {
        modelVersion: degraded ? "degraded-fallback" : "live",
        promptHash,
        recommendationJson: recommendationJson as never,
        confidence,
      },
    });
  } else {
    decision = await prisma.agentDecision.create({
      data: {
        organizationId,
        resourceType: RESOURCE_TYPE,
        resourceId: contractId,
        agentName: AGENT_NAME,
        modelId: CLAUDE_MODEL,
        modelVersion: degraded ? "degraded-fallback" : "live",
        promptHash,
        recommendationJson: recommendationJson as never,
        confidence,
        approvalStatus: AgentApprovalStatus.PENDING,
      },
    });
  }

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
    action: "contract.change_narrative.generated",
    resourceType: "AgentDecision",
    resourceId: decision.id,
    afterJson: { contractId, fromVersion, toVersion, degraded, riskAssessment } as never,
    metadata: { source: "contracts", agent: AGENT_NAME } as never,
  });

  return toDTO(decision, null);
}

/**
 * Resolve a pending narrative decision — the human gate. Approve/reject is
 * the ONLY path off PENDING; the verdict is immutable afterward. Writes a
 * chain-sealed AuditLog row and links it back onto the decision as the
 * evidence anchor.
 */
export async function resolveChangeNarrative(
  organizationId: string,
  contractId: string,
  decisionId: string,
  action: "approve" | "reject",
  actor: Actor,
): Promise<ChangeNarrativeDTO> {
  const decision = await prisma.agentDecision.findFirst({
    where: { id: decisionId, organizationId, resourceType: RESOURCE_TYPE, resourceId: contractId, agentName: AGENT_NAME },
  });
  if (!decision) throw new Error("Narrative decision not found");
  if (decision.approvalStatus !== AgentApprovalStatus.PENDING) {
    throw new Error("This narrative has already been resolved — the verdict is immutable.");
  }

  const status = action === "approve" ? AgentApprovalStatus.APPROVED : AgentApprovalStatus.REJECTED;
  const rec = (decision.recommendationJson ?? {}) as Record<string, unknown>;

  const auditId = await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
    action: action === "approve" ? "contract.change_narrative.approved" : "contract.change_narrative.rejected",
    resourceType: "AgentDecision",
    resourceId: decision.id,
    beforeJson: { status: "PENDING" } as never,
    afterJson: { contractId, fromVersion: rec.fromVersion, toVersion: rec.toVersion, status } as never,
    metadata: { source: "contracts", agent: AGENT_NAME } as never,
  });

  const updated = await prisma.agentDecision.update({
    where: { id: decision.id },
    data: {
      approvalStatus: status,
      approvedById: action === "approve" ? actor.id ?? null : null,
      approvedAt: new Date(),
      resultingAuditLogId: auditId,
    },
  });

  return toDTO(updated, await resolveApproverName(updated.approvedById));
}
