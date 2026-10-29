/**
 * AI semantic extraction + grading for inbound-paper review (Task 2b).
 *
 * The deterministic `extract.ts` + Jaccard grading (PR C / Task 2a) is fast and
 * offline-safe but regex-bound: it only flags terms whose exact phrasing it was
 * taught, so a reworded or novel off-playbook clause slips through. This module
 * reads the ACTUAL document text with Claude, against the published playbook
 * positions, and returns findings in the SAME `BuiltFinding[]` shape the
 * deterministic path produces — so everything downstream (persist, PENDING
 * AgentDecision per finding, apply → chain-sealed version) is unchanged.
 *
 * It is strictly an ADD-ON: `startContractReview` tries this first for inbound
 * paper and falls back to the deterministic grading on any failure (no model,
 * timeout, unparseable reply, or empty result). The governance gate is never
 * bypassed — AI findings are PENDING like any other and a human approves each.
 *
 * `mapAiFindingsToBuilt` is pure (no DB, no network) and unit-tested; the async
 * `aiGradeReview` composes it with the @aegis/ai transport.
 */
import { callClaude, parseJSONLoose } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";
import type { PlaybookRuleDTO } from "./playbook";
import type { BuiltFinding, ReviewClauseInput, ReviewGradeT, EditKindT } from "./review";

/** The model's per-clause verdict (validated + coerced before use). */
export interface AiReviewFinding {
  clauseType: string;
  grade: ReviewGradeT;
  /** The clause text as it appears in their document (≤ ~240 chars). "" for MISSING. */
  excerpt: string;
  rationale: string;
  /** Our proposed language (the redline target). Null when advisory only. */
  suggestedText: string | null;
  /** 1 (minor) · 2 (fallback) · 3 (escalate/missing). */
  severity: number;
}

const GRADES = new Set<ReviewGradeT>(["STANDARD", "FALLBACK", "ESCALATE", "MISSING"]);
const MAX_FINDINGS = 60;
const MAX_DOC_CHARS = 14000;

/** Normalize a free-text clause type to the playbook's TYPE_KEY convention. */
export function normalizeClauseType(t: string): string {
  return String(t || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function defaultSeverityFor(grade: ReviewGradeT): number {
  return grade === "ESCALATE" || grade === "MISSING" ? 3 : grade === "FALLBACK" ? 1 : 0;
}

/** Same severity weighting the deterministic path uses. */
function weightedSeverity(grade: ReviewGradeT, ruleWeight: number | undefined): number {
  const w = Math.max(1, ruleWeight || 1);
  switch (grade) {
    case "ESCALATE": return 3 * w;
    case "MISSING": return 3 * w;
    case "FALLBACK": return 1 * w;
    default: return 0;
  }
}

export function buildAiReviewPrompt(
  docText: string,
  rules: PlaybookRuleDTO[],
  opts: { contractType: string; perspective: string | null },
): string {
  const positions = rules.slice(0, 30).map((r) => {
    const bits = [
      `- ${r.clauseType}${r.required ? " (REQUIRED)" : ""}: ${(r.preferredText || "").slice(0, 240)}`,
      r.guidance ? `    guidance: ${r.guidance.slice(0, 200)}` : "",
      r.escalationTrigger ? `    escalate if: ${r.escalationTrigger.slice(0, 160)}` : "",
    ].filter(Boolean);
    return bits.join("\n");
  }).join("\n");
  const allowed = rules.map((r) => r.clauseType).join(", ");
  const posture = opts.perspective === "MUTUAL"
    ? "This should be an even-handed (mutual) agreement."
    : opts.perspective === "THEIR_SIDE"
    ? "We are reviewing the counterparty's paper; protect our side."
    : "We are reviewing the counterparty's paper on our standard positions; protect our side.";
  return [
    "You are senior in-house counsel reviewing a third-party contract against our playbook.",
    posture,
    `Contract type: ${opts.contractType}.`,
    "",
    "OUR PLAYBOOK POSITIONS (grade each material clause against these):",
    positions || "(no explicit positions on file — grade against ordinary market-standard expectations for our side)",
    "",
    "Read the DOCUMENT below and return EVERY material clause you can identify, plus any REQUIRED clause that is missing.",
    "For each, grade it:",
    "- STANDARD: matches our position / unobjectionable.",
    "- FALLBACK: a departure we can live with, with rationale.",
    "- ESCALATE: off-playbook / materially adverse — must be redlined before signing.",
    "- MISSING: a required protection the document omits entirely.",
    "Catch substance regardless of wording — e.g. a foreign governing law, perpetual/indefinite confidentiality, one-sided IP assignment, uncapped or one-sided liability/indemnity, a residuals clause, auto-renewal without a notice window, a struck or weakened protection.",
    "",
    `Use these clauseType keys where they fit: ${allowed || "(derive sensible UPPER_SNAKE keys)"}. If a clause has no matching key, use a sensible UPPER_SNAKE key of your own.`,
    "",
    "Return ONLY a JSON object of this exact shape (no prose, no code fence):",
    '{"findings":[{"clauseType":"GOVERNING_LAW","grade":"ESCALATE","excerpt":"<=240 chars quoted from the doc, or \\"\\" for MISSING","rationale":"one sentence","suggestedText":"our proposed language or null","severity":1}]}',
    "severity is 1 (minor), 2 (fallback), or 3 (escalate/missing).",
    "",
    "DOCUMENT:",
    (docText || "").slice(0, MAX_DOC_CHARS),
  ].join("\n");
}

/** Validate + coerce a raw model reply into clean AiReviewFinding[]. Never throws. */
export function coerceAiFindings(raw: unknown): AiReviewFinding[] {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { findings?: unknown[] }).findings)
    ? (raw as { findings: unknown[] }).findings
    : [];
  const out: AiReviewFinding[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const clauseType = normalizeClauseType(String(o.clauseType ?? ""));
    const grade = String(o.grade ?? "").toUpperCase() as ReviewGradeT;
    if (!clauseType || !GRADES.has(grade)) continue;
    const excerpt = String(o.excerpt ?? "").slice(0, 400);
    const rationale = String(o.rationale ?? "").slice(0, 600);
    const suggestedRaw = o.suggestedText;
    const suggestedText = suggestedRaw == null || suggestedRaw === "" ? null : String(suggestedRaw).slice(0, 4000);
    let severity = Number(o.severity);
    if (!Number.isFinite(severity) || severity < 0) severity = defaultSeverityFor(grade);
    out.push({ clauseType, grade, excerpt, rationale, suggestedText, severity: Math.round(severity) });
    if (out.length >= MAX_FINDINGS) break;
  }
  return out;
}

/**
 * Map validated AI findings onto the deterministic `BuiltFinding[]` schema.
 * Anchors each finding to an existing extracted clause of the same type when
 * one is free (so the redline applies by anchor); when none is free, an
 * off-playbook finding stays ESCALATE/FALLBACK but editKind NONE (advisory —
 * it surfaces with our proposed language but does not auto-rewrite a clause row
 * that was never extracted). MISSING required clauses become INSERTIONs. Then
 * appends deterministic MISSING for any required rule neither the AI nor the
 * extracted clause set covered. Pure.
 */
export function mapAiFindingsToBuilt(
  ai: AiReviewFinding[],
  liveClauses: ReviewClauseInput[],
  rules: PlaybookRuleDTO[],
): BuiltFinding[] {
  const rulesByType = new Map<string, PlaybookRuleDTO>();
  for (const r of rules) if (!rulesByType.has(r.clauseType)) rulesByType.set(r.clauseType, r);

  // Pool of unclaimed anchors per clause type (FIFO).
  const anchorsByType = new Map<string, string[]>();
  for (const c of liveClauses) {
    const list = anchorsByType.get(c.clauseType) ?? [];
    list.push(c.anchorId);
    anchorsByType.set(c.clauseType, list);
  }
  const claimAnchor = (type: string): string | null => {
    const list = anchorsByType.get(type);
    if (list && list.length) return list.shift() as string;
    return null;
  };

  const coveredTypes = new Set<string>();
  const findings: BuiltFinding[] = [];

  for (const f of ai) {
    const rule = rulesByType.get(f.clauseType);
    coveredTypes.add(f.clauseType);

    if (f.grade === "STANDARD") {
      const anchor = claimAnchor(f.clauseType);
      findings.push({
        clauseAnchorId: anchor, clauseType: f.clauseType, grade: "STANDARD", editKind: "NONE",
        ourPosition: rule?.preferredText ?? null, theirPosition: f.excerpt || null,
        rationale: f.rationale || "Matches our standard position.", suggestedText: null,
        playbookRuleId: rule?.id ?? null, severity: 0, orderIndex: 0,
      });
      continue;
    }

    if (f.grade === "MISSING") {
      // MISSING only makes sense against a known rule — otherwise treat as advisory.
      if (rule) {
        findings.push({
          clauseAnchorId: null, clauseType: f.clauseType, grade: "MISSING", editKind: "INSERTION",
          ourPosition: rule.preferredText, theirPosition: null,
          rationale: f.rationale || `Required clause is missing. ${rule.guidance ?? ""}`.trim(),
          suggestedText: f.suggestedText || rule.requiredLanguage || rule.preferredText,
          playbookRuleId: rule.id, severity: weightedSeverity("MISSING", rule.severityWeight), orderIndex: 0,
        });
      }
      continue;
    }

    // FALLBACK / ESCALATE
    const anchor = claimAnchor(f.clauseType);
    const suggested = f.suggestedText || rule?.preferredText || null;
    // Anchored + we have replacement language → a real redline; otherwise advisory.
    const editKind: EditKindT = anchor && suggested ? "REPLACEMENT" : "NONE";
    findings.push({
      clauseAnchorId: anchor, clauseType: f.clauseType, grade: f.grade, editKind,
      ourPosition: rule?.preferredText ?? null, theirPosition: f.excerpt || null,
      rationale: f.rationale || (f.grade === "ESCALATE" ? "Off-playbook — redline before signing." : "Acceptable fallback, not our preferred position."),
      suggestedText: suggested,
      playbookRuleId: rule?.id ?? null,
      severity: rule ? weightedSeverity(f.grade, rule.severityWeight) : (f.grade === "ESCALATE" ? 3 : 1),
      orderIndex: 0,
    });
  }

  // Required rules neither graded by the AI nor present as an extracted clause → MISSING.
  const liveTypes = new Set(liveClauses.map((c) => c.clauseType));
  for (const rule of rules) {
    if (!rule.required) continue;
    if (coveredTypes.has(rule.clauseType) || liveTypes.has(rule.clauseType)) continue;
    findings.push({
      clauseAnchorId: null, clauseType: rule.clauseType, grade: "MISSING", editKind: "INSERTION",
      ourPosition: rule.preferredText, theirPosition: null,
      rationale: `Required clause is missing from their paper. ${rule.guidance ?? ""}`.trim(),
      suggestedText: rule.requiredLanguage || rule.preferredText, playbookRuleId: rule.id,
      severity: weightedSeverity("MISSING", rule.severityWeight), orderIndex: 0,
    });
  }

  // Worst-first, stable; assign orderIndex.
  findings.sort((a, b) => b.severity - a.severity);
  findings.forEach((f, i) => { f.orderIndex = i; });
  return findings;
}

/**
 * Run the AI review pass. Returns mapped BuiltFinding[] on success; THROWS on
 * any failure (no transport, timeout, unparseable, or empty) so the caller
 * falls back to deterministic grading. Never persists anything itself.
 */
export async function aiGradeReview(
  docText: string,
  liveClauses: ReviewClauseInput[],
  rules: PlaybookRuleDTO[],
  opts: { contractType: string; perspective: string | null },
): Promise<BuiltFinding[]> {
  if (!docText || docText.trim().length < 80) throw new Error("Document too short for AI review");
  ensureServerClaudeTransport();
  const prompt = buildAiReviewPrompt(docText, rules, opts);
  const raw = await callClaude(prompt, { maxTokens: 4000, timeout: 60000 });
  const parsed = parseJSONLoose(String(raw || ""));
  const ai = coerceAiFindings(parsed);
  if (ai.length === 0) throw new Error("AI review returned no usable findings");
  return mapAiFindingsToBuilt(ai, liveClauses, rules);
}
