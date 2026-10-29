/**
 * AI clause redline (C-1) — the brain behind the Word add-in.
 *
 * Given an original clause and a plain-language instruction ("cap our liability
 * at fees paid", "shorten the term to one year", "make the indemnity mutual"),
 * Claude rewrites the clause on OUR standard, and we compute the word-level
 * track-changes diff (`diffWords`, CTR-16) so the add-in — or the downloadable
 * `.docx` — shows insertions and deletions exactly as Word renders a redline.
 *
 * Degrades to a no-op redline (original unchanged, explained) when Claude is
 * unavailable, so the add-in never dead-ends. The suggestion is advisory: the
 * human accepts or rejects each tracked change in Word — that acceptance is the
 * governance gate, so this generate step mutates no OneLegal state. When the
 * redline targets a persisted contract, a best-effort `contract.redline.suggested`
 * audit row records that OneLegal proposed a change (no `before`/`after` — nothing
 * was applied).
 */
import { callClaude, parseJSONLoose } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";
import { logAudit } from "@aegis/db";
import { diffWords, wordDiffStats, type WordDiffSegment } from "./word-diff";
import { getClauseLibraryByType } from "./clause-library";

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };

export class RedlineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedlineValidationError";
  }
}

export interface RedlineClauseInput {
  /** The clause text as it stands today (the "before"). */
  original: string;
  /** Plain-language redline instruction from counsel. */
  instruction: string;
  /** Optional playbook key (e.g. "liability") used to fetch our standard position. */
  clauseType?: string | null;
  /** Optional display label for the clause (e.g. "Section 8 — Limitation of Liability"). */
  clauseLabel?: string | null;
  /** When the redline targets a persisted contract, its id (drives the audit row). */
  contractId?: string | null;
}

export interface RedlineResult {
  /** The proposed clause text (the "after"). Equals `original` when degraded. */
  revised: string;
  /** Why the change was made, in plain language. */
  rationale: string;
  /** Ordered track-changes segments (equal / insert / delete). */
  segments: WordDiffSegment[];
  /** Added / removed word counts for a one-line summary. */
  stats: { added: number; removed: number };
  /** True when Claude was unavailable and no automated redline was produced. */
  degraded: boolean;
  /** When degraded, a short reason for diagnosis (surfaced to the caller). */
  degradedReason?: string | null;
}

/** Injectable Claude runner so the diff assembly is unit-testable offline. */
export type RedlineRunner = (prompt: string) => Promise<{ revised?: unknown; rationale?: unknown }>;

/** Delimiter separating the rewritten clause from its rationale in the reply. */
const RATIONALE_DELIM = "---RATIONALE---";

function buildPrompt(input: RedlineClauseInput, standard?: string): string {
  return [
    "You are senior in-house counsel redlining a single contract clause ON OUR PAPER (protective of us).",
    "Rewrite the clause to satisfy the instruction while keeping it enforceable and well-drafted.",
    "Make the MINIMAL change that satisfies the instruction — preserve wording that does not need to change so the redline is clean.",
    "",
    "ORIGINAL CLAUSE:",
    input.original.slice(0, 8000),
    "",
    "INSTRUCTION:",
    input.instruction.slice(0, 2000),
    "",
    standard ? `OUR STANDARD POSITION for this clause type:\n${standard.slice(0, 1500)}\n` : "",
    `Return ONLY the rewritten clause text, then a line containing exactly ${RATIONALE_DELIM}, then one or two sentences on what changed and why. No JSON, no code fences.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Parse the model's reply into { revised, rationale }. Primary format is plain
 * text — the clause, then a `---RATIONALE---` line, then the rationale — which
 * (unlike the old "whole clause inside a JSON string field" envelope) cannot be
 * broken by quotes/newlines in the clause. Still salvages an older
 * `{"revised":…,"rationale":…}` envelope for back-compat. Pure.
 */
export function parseRedlineReply(raw: string): { revised?: string; rationale?: string } {
  let s = (raw || "").trim();
  if (!s) return {};
  const fence = s.match(/^```(?:json|markdown|md|text)?\s*\n([\s\S]*?)\n```$/i);
  if (fence && fence[1]) s = fence[1].trim();
  if (/^\{[\s\S]*"revised"[\s\S]*\}$/.test(s)) {
    try {
      const obj = parseJSONLoose(s) as Record<string, unknown>;
      const revised = typeof obj.revised === "string" ? obj.revised.trim() : undefined;
      const rationale = typeof obj.rationale === "string" ? obj.rationale.trim() : undefined;
      if (revised) return { revised, rationale };
    } catch { /* not valid JSON — fall through to the plain-text parse */ }
  }
  const idx = s.indexOf(RATIONALE_DELIM);
  if (idx >= 0) {
    const revised = s.slice(0, idx).trim();
    const rationale = s.slice(idx + RATIONALE_DELIM.length).trim();
    return { revised: revised || undefined, rationale: rationale || undefined };
  }
  return { revised: s };
}

const defaultRunner: RedlineRunner = async (prompt) => {
  ensureServerClaudeTransport();
  const text = await callClaude(prompt, { maxTokens: 2000, timeout: 60000 });
  return parseRedlineReply(String(text || ""));
};

/**
 * Produce a redline for one clause. Pure given its injected `runner`; the diff
 * and stats are deterministic, so tests drive it with a stub and never touch
 * the network.
 */
export async function redlineClause(
  organizationId: string,
  input: RedlineClauseInput,
  actor: Actor,
  runner: RedlineRunner = defaultRunner,
): Promise<RedlineResult> {
  const original = (input.original ?? "").trim();
  const instruction = (input.instruction ?? "").trim();
  if (!original) throw new RedlineValidationError("original clause text is required");
  if (!instruction) throw new RedlineValidationError("a redline instruction is required");

  let standard: string | undefined;
  if (input.clauseType) {
    const library = await getClauseLibraryByType(organizationId).catch(
      () => ({}) as Record<string, { standardText: string }>,
    );
    standard = library[input.clauseType]?.standardText;
  }

  let revised = original;
  let rationale = "AI was unavailable, so no automated redline was proposed — attorney to draft the change.";
  let degraded = true;
  let degradedReason: string | null = null;
  try {
    const raw = await runner(buildPrompt(input, standard));
    const r = typeof raw?.revised === "string" ? raw.revised.trim() : "";
    if (r.length > 0) {
      revised = r;
      rationale =
        typeof raw?.rationale === "string" && raw.rationale.trim()
          ? raw.rationale.trim()
          : "Clause rewritten to satisfy the instruction.";
      degraded = false;
    } else {
      degradedReason = "The model did not return a usable rewrite.";
    }
  } catch (e) {
    degradedReason = e instanceof Error ? e.message : String(e);
    console.error("[contract-redline] redline runner failed, returning no-op redline:", e);
  }

  const segments = diffWords(original, revised);
  const stats = wordDiffStats(segments);

  if (input.contractId) {
    await logAudit({
      organizationId,
      actorId: actor.id,
      actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
      action: "contract.redline.suggested",
      resourceType: "Contract",
      resourceId: input.contractId,
      metadata: {
        clauseLabel: input.clauseLabel ?? null,
        clauseType: input.clauseType ?? null,
        instruction: instruction.slice(0, 300),
        added: stats.added,
        removed: stats.removed,
        degraded,
        degradedReason,
      },
    });
  }

  return { revised, rationale, segments, stats, degraded, degradedReason };
}
