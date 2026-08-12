/**
 * Third-party contract review assessment (CTR-13) — the "what to sign / which
 * clauses are we NOT comfortable with" position summary.
 *
 * Two layers, one shape:
 *   - DETERMINISTIC (instant, always available): from the extracted clause set +
 *     our playbook — every deviating / high-risk clause becomes an issue with a
 *     recommended position. Fast, offline-safe.
 *   - AI (on demand, robust): Claude reads the FULL contract text — the client's
 *     own template, whatever it looks like — and surfaces issues even outside our
 *     standard clause taxonomy, with a concern and a recommended position each.
 *     This removes the "we only see clauses we already know" limitation. Degrades
 *     cleanly to the deterministic view when Claude is unavailable.
 *
 * Advisory only: the assessment informs the human reviewer; it mutates nothing
 * and gates nothing — the reviewer decides what to accept, negotiate, or reject.
 */
import { prisma } from "@aegis/db";
import { callClaudeJSON, parseJSONLoose } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";
import { getClauseLibraryByType } from "./clause-library";
import { scoreContractClauses } from "./risk-score";

export type AssessmentVerdict = "SIGN_AS_IS" | "NEGOTIATE" | "DO_NOT_SIGN";
export type ClausePosition = "ACCEPT" | "NEGOTIATE" | "REJECT";

export interface AssessmentIssue {
  clauseType: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  position: ClausePosition;
  /** Why we're not comfortable with the clause as written. */
  concern: string;
  /** What we should push for. */
  recommendedPosition: string;
}

export interface ContractAssessmentDTO {
  contractId: string;
  verdict: AssessmentVerdict;
  summary: string;
  issues: AssessmentIssue[];
  clauseCount: number;
  deviationCount: number;
  riskScore: number | null;
  riskBand: string;
  source: "ai" | "deterministic";
  degraded: boolean;
  generatedAt: string;
}

type ClauseRow = { type: string; text: string; risk: string; deviation: boolean };

async function loadForAssessment(organizationId: string, contractId: string) {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, organizationId },
    select: { id: true, title: true, type: true, draftText: true },
  });
  if (!contract) throw new Error("Contract not found");
  const clauses = await prisma.contractClause.findMany({
    where: { contractId },
    select: { type: true, text: true, risk: true, deviation: true },
    orderBy: { createdAt: "asc" },
  });
  return { contract, clauses: clauses as ClauseRow[] };
}

export function verdictFromIssues(issues: AssessmentIssue[]): AssessmentVerdict {
  if (issues.some((i) => i.position === "REJECT")) return "DO_NOT_SIGN";
  if (issues.some((i) => i.position === "NEGOTIATE")) return "NEGOTIATE";
  return "SIGN_AS_IS";
}

export function summarize(issues: AssessmentIssue[]): string {
  if (issues.length === 0) return "No problematic clauses found — the contract is acceptable to sign as-is.";
  const reject = issues.filter((i) => i.position === "REJECT").length;
  const negotiate = issues.filter((i) => i.position === "NEGOTIATE").length;
  const parts: string[] = [];
  if (reject) parts.push(`${reject} to reject`);
  if (negotiate) parts.push(`${negotiate} to negotiate`);
  return `${issues.length} clause${issues.length === 1 ? "" : "s"} need attention before signing${parts.length ? ` (${parts.join(", ")})` : ""}.`;
}

/** Deterministic assessment from the clause set + playbook — instant, offline-safe. */
export async function assessContractDeterministic(
  organizationId: string,
  contractId: string,
): Promise<ContractAssessmentDTO> {
  const { clauses } = await loadForAssessment(organizationId, contractId);
  const playbook = await getClauseLibraryByType(organizationId).catch(() => ({}) as Record<string, { standardText: string; fallbackText: string | null; guidance: string | null }>);
  const risk = scoreContractClauses(clauses.map((c) => ({ type: c.type, risk: c.risk as "LOW" | "MEDIUM" | "HIGH", deviation: c.deviation })));

  const issues: AssessmentIssue[] = [];
  for (const c of clauses) {
    const flagged = c.deviation || c.risk === "HIGH" || c.risk === "MEDIUM";
    if (!flagged) continue;
    const position: ClausePosition = c.deviation && c.risk === "HIGH" ? "REJECT" : c.deviation || c.risk === "HIGH" ? "NEGOTIATE" : "NEGOTIATE";
    const pb = playbook[c.type];
    issues.push({
      clauseType: c.type,
      severity: (c.risk as "HIGH" | "MEDIUM" | "LOW") ?? "MEDIUM",
      position,
      concern: c.deviation ? "Deviates from our standard position." : "High-risk clause on the counterparty's terms.",
      recommendedPosition: pb?.fallbackText || pb?.standardText || pb?.guidance || "Apply our standard position for this clause.",
    });
  }
  // Highest severity first.
  const rank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  issues.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));

  return {
    contractId,
    verdict: verdictFromIssues(issues),
    summary: summarize(issues),
    issues,
    clauseCount: clauses.length,
    deviationCount: clauses.filter((c) => c.deviation).length,
    riskScore: risk.score,
    riskBand: risk.band,
    source: "deterministic",
    degraded: false,
    generatedAt: new Date().toISOString(),
  };
}

function buildAssessmentPrompt(input: {
  title: string;
  type: string;
  text: string;
  playbookPositions: Array<{ type: string; standard: string; fallback: string | null }>;
}): string {
  const playbook = input.playbookPositions.length
    ? input.playbookPositions.map((p) => `- ${p.type}: standard = ${p.standard.slice(0, 300)}${p.fallback ? ` | acceptable fallback = ${p.fallback.slice(0, 200)}` : ""}`).join("\n")
    : "(no playbook positions on file — use general in-house counsel judgement)";
  return [
    "You are senior in-house counsel reviewing a contract the counterparty sent us ON THEIR OWN TEMPLATE.",
    "Decide what we can sign and which clauses we are NOT comfortable with as written.",
    "Assess the WHOLE document — flag risky, one-sided, unusual, or missing provisions even if they are not standard clause types.",
    "",
    `Contract: "${input.title}" (type: ${input.type}).`,
    "",
    "Our playbook positions:",
    playbook,
    "",
    "Contract text:",
    '"""',
    input.text.slice(0, 24000),
    '"""',
    "",
    "Return STRICT JSON only, no prose, in this exact shape:",
    '{"verdict":"SIGN_AS_IS|NEGOTIATE|DO_NOT_SIGN","summary":"one sentence","issues":[{"clauseType":"short label","severity":"HIGH|MEDIUM|LOW","position":"ACCEPT|NEGOTIATE|REJECT","concern":"why we are not comfortable","recommendedPosition":"what to push for"}]}',
    "Only include issues that genuinely need attention. verdict = DO_NOT_SIGN if any REJECT, NEGOTIATE if any NEGOTIATE, else SIGN_AS_IS.",
  ].join("\n");
}

const VALID_SEV = new Set(["HIGH", "MEDIUM", "LOW"]);
const VALID_POS = new Set(["ACCEPT", "NEGOTIATE", "REJECT"]);

/**
 * AI-powered assessment: Claude reads the full contract text (robust to any
 * template) and returns the position summary. Falls back to the deterministic
 * assessment (degraded:true) if the model is unavailable or returns nothing.
 */
export async function assessContractWithAI(
  organizationId: string,
  contractId: string,
): Promise<ContractAssessmentDTO> {
  const { contract, clauses } = await loadForAssessment(organizationId, contractId);
  const text = (contract.draftText || clauses.map((c) => `${c.type}: ${c.text}`).join("\n\n")).trim();
  if (!text) return assessContractDeterministic(organizationId, contractId);

  const playbookMap = await getClauseLibraryByType(organizationId).catch(() => ({}) as Record<string, { standardText: string; fallbackText: string | null }>);
  const playbookPositions = Object.entries(playbookMap).map(([type, e]) => ({ type, standard: e.standardText, fallback: e.fallbackText }));

  try {
    ensureServerClaudeTransport();
    const prompt = buildAssessmentPrompt({ title: contract.title, type: contract.type, text, playbookPositions });
    const raw = (await callClaudeJSON(prompt, { maxTokens: 1400, timeout: 60000 })) as Record<string, unknown>;
    const parsed = (typeof raw === "string" ? parseJSONLoose(raw) : raw) as Record<string, unknown>;
    const issuesRaw = Array.isArray(parsed.issues) ? parsed.issues : [];
    const issues: AssessmentIssue[] = issuesRaw
      .map((r) => r as Record<string, unknown>)
      .map((r) => ({
        clauseType: String(r.clauseType ?? "Clause").slice(0, 60),
        severity: (VALID_SEV.has(String(r.severity)) ? String(r.severity) : "MEDIUM") as AssessmentIssue["severity"],
        position: (VALID_POS.has(String(r.position)) ? String(r.position) : "NEGOTIATE") as ClausePosition,
        concern: String(r.concern ?? "").slice(0, 600),
        recommendedPosition: String(r.recommendedPosition ?? "").slice(0, 600),
      }))
      .filter((i) => i.concern);
    if (issues.length === 0 && !parsed.verdict) throw new Error("Empty assessment");

    const risk = scoreContractClauses(clauses.map((c) => ({ type: c.type, risk: c.risk as "LOW" | "MEDIUM" | "HIGH", deviation: c.deviation })));
    const verdict = (["SIGN_AS_IS", "NEGOTIATE", "DO_NOT_SIGN"].includes(String(parsed.verdict)) ? String(parsed.verdict) : verdictFromIssues(issues)) as AssessmentVerdict;
    return {
      contractId,
      verdict,
      summary: String(parsed.summary || summarize(issues)),
      issues,
      clauseCount: clauses.length,
      deviationCount: clauses.filter((c) => c.deviation).length,
      riskScore: risk.score,
      riskBand: risk.band,
      source: "ai",
      degraded: false,
      generatedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.error("[contract-assessment] AI assessment failed, using deterministic fallback:", e);
    const det = await assessContractDeterministic(organizationId, contractId);
    return { ...det, degraded: true };
  }
}
