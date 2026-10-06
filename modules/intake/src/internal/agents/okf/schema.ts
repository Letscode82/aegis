/**
 * Open Knowledge Format (oKF) — the canonical document shape for a
 * data-driven agent, plus a pure validator.
 *
 * An oKF document is the *whole* spec for one agent: identity, routing,
 * model params, prompt, output thresholds, approver risks, playbook stamp,
 * and the KnowledgePacks it reads. It is what the Agent Designer edits,
 * what `serialize.ts` renders to canonical JSON for export/import + version
 * hashing, and what the runtime executes. The format is deliberately flat
 * and declarative so it round-trips losslessly and a human can read a diff.
 *
 * GOVERNANCE: an oKF document describes WHAT an agent does. It has no field
 * that can disable the human-approval gate — the runtime always writes a
 * PENDING AgentDecision regardless of anything here. See runtime.js.
 */

export const OKF_VERSION = 1 as const;

export type PromptMode = "json" | "text";

export interface OkfRouting {
  /** aiTriage.category substrings/regex that claim the ticket. */
  matchCategory: string[];
  /** ticket.type substrings/regex that claim the ticket. */
  matchType: string[];
  /** description keywords that claim the ticket. */
  matchKeyword: string[];
  /** keywords that VETO this agent even if a match fired (e.g. "nda"). */
  excludeKeyword: string[];
  /** if true, only claims the ticket when a document is attached. */
  requiresDocument: boolean;
}

export interface OkfModel {
  /** optional model id override; null = platform default. */
  model: string | null;
  maxTokens: number;
  timeout: number;
  temperature: number | null;
  /** cap on how much ticket/document text to send (token-budget guard). */
  maxDocChars: number;
}

export interface OkfPrompt {
  mode: PromptMode;
  /** the instruction template; supports {{ticket.*}}, {{knowledge}}, … */
  systemTemplate: string;
  /** for mode="json": the required JSON response contract, appended. */
  jsonContract: string | null;
  /** plain-text retry template (the #208 reliability fallback). */
  fallbackTemplate: string | null;
  /** declared template variables, for the Designer's insert-variable UI. */
  variables: string[];
}

export interface OkfPrecedentLink {
  id: string;
  title: string;
}

export interface OkfOutput {
  /** confidence ≥ this → suggestedAction becomes the auto-send action. */
  autoSendAtConfidence: number;
  /** confidence used when the agent degrades (both Claude calls fail). */
  degradedConfidence: number;
  /** action below the auto-send threshold, e.g. "flag-for-review". */
  defaultAction: string;
  /** action at/above the threshold, e.g. "approve-and-send". */
  autoSendAction: string;
  precedentLinks: OkfPrecedentLink[];
  /** Deterministic concerns prepended to EVERY recommendation, whatever
   *  Claude returns — e.g. a mandatory legal-hold-trigger flag. Survives
   *  the degraded path too. */
  alwaysConcerns: string[];
}

export interface OkfPlaybook {
  id: string;
  version: string;
}

export type ExecutionMode = "okf" | "code";

export interface OkfAgent {
  key: string;
  name: string;
  shortName: string | null;
  icon: string | null;
  description: string | null;
  enabled: boolean;
  productionReady: boolean;
  displayOrder: number;
  /**
   * How the agent executes:
   *  - "okf"  : run entirely from this definition via the generic runtime
   *             (pure-prompt agents — the Designer's edits drive live output).
   *  - "code" : run the code-shipped process() (tool-augmented agents that
   *             do deterministic work — counterparty lookups, sanctions
   *             screening, deadline computation — the prompt-only runtime
   *             cannot replicate). Still reads its oKF knowledge/config.
   */
  executionMode: ExecutionMode;
  routing: OkfRouting;
  model: OkfModel;
  prompt: OkfPrompt;
  output: OkfOutput;
  risks: string[];
  playbook: OkfPlaybook;
  approverRole: string | null;
  /**
   * Declared tool providers this agent runs BEFORE the Claude call. Each
   * resolves deterministic context (e.g. "counterparty" → record pull)
   * that the runtime injects as {{tool.<name>}} in the prompt. Tools
   * provide CONTEXT — they do not gate the action. An agent whose
   * deterministic step must GATE the recommendation (sanctions hit →
   * escalate; missed deadline) stays executionMode "code".
   */
  tools: string[];
}

export type OkfItemKind = "CLAUSE" | "RULE" | "QA" | "TEMPLATE" | "REFERENCE";

export interface OkfKnowledgeItem {
  code: string;
  kind: OkfItemKind;
  title: string;
  bodyMarkdown: string;
  data: Record<string, unknown>;
  cohortTags: string[];
  sortOrder: number;
}

export interface OkfCohort {
  key: string;
  name: string;
  tag: string;
  selector: Record<string, unknown>;
  sortOrder: number;
}

export type OkfPackKind =
  | "CONTRACT_CLAUSES"
  | "APPROVED_KB"
  | "POLICY_CORPUS"
  | "NOTICE_TAXONOMY"
  | "CONTRACT_TYPE_CATALOG"
  | "PRIVACY_TRIAGE"
  | "CLAIMS_LIBRARY"
  | "TEMPLATE"
  | "REFERENCE";

export interface OkfPack {
  key: string;
  name: string;
  description: string | null;
  kind: OkfPackKind;
  items: OkfKnowledgeItem[];
  cohorts: OkfCohort[];
}

export interface OkfDocument {
  okfVersion: number;
  agent: OkfAgent;
  knowledge: OkfPack[];
}

export interface OkfValidationResult {
  ok: boolean;
  errors: string[];
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isArr = (v: unknown): v is unknown[] => Array.isArray(v);

/**
 * Pure structural validation of an oKF document. Not a JSON-schema library
 * — deliberately dependency-free and unit-testable. Returns the full list
 * of problems (empty = valid) so the Designer's import can show them all.
 */
export function validateOkfDocument(doc: unknown): OkfValidationResult {
  const errors: string[] = [];
  const d = doc as Partial<OkfDocument>;
  if (!d || typeof d !== "object") return { ok: false, errors: ["document is not an object"] };
  if (d.okfVersion !== OKF_VERSION) errors.push(`okfVersion must be ${OKF_VERSION}`);

  const a = d.agent as Partial<OkfAgent> | undefined;
  if (!a || typeof a !== "object") {
    errors.push("agent is required");
  } else {
    if (!isStr(a.key) || !a.key.trim()) errors.push("agent.key is required");
    if (!isStr(a.name) || !a.name.trim()) errors.push("agent.name is required");
    if (!isBool(a.enabled)) errors.push("agent.enabled must be boolean");
    const r = a.routing as Partial<OkfRouting> | undefined;
    if (!r || typeof r !== "object") errors.push("agent.routing is required");
    else {
      for (const k of ["matchCategory", "matchType", "matchKeyword", "excludeKeyword"] as const) {
        if (!isArr(r[k])) errors.push(`agent.routing.${k} must be an array`);
      }
      if (!isBool(r.requiresDocument)) errors.push("agent.routing.requiresDocument must be boolean");
    }
    const m = a.model as Partial<OkfModel> | undefined;
    if (!m || typeof m !== "object") errors.push("agent.model is required");
    else {
      if (!isNum(m.maxTokens) || m.maxTokens <= 0) errors.push("agent.model.maxTokens must be > 0");
      if (!isNum(m.timeout) || m.timeout <= 0) errors.push("agent.model.timeout must be > 0");
      if (!isNum(m.maxDocChars) || m.maxDocChars <= 0) errors.push("agent.model.maxDocChars must be > 0");
    }
    const p = a.prompt as Partial<OkfPrompt> | undefined;
    if (!p || typeof p !== "object") errors.push("agent.prompt is required");
    else {
      if (p.mode !== "json" && p.mode !== "text") errors.push('agent.prompt.mode must be "json" or "text"');
      if (!isStr(p.systemTemplate) || !p.systemTemplate.trim()) errors.push("agent.prompt.systemTemplate is required");
    }
    const o = a.output as Partial<OkfOutput> | undefined;
    if (!o || typeof o !== "object") errors.push("agent.output is required");
    else {
      // Allow > 1 as the "never auto-send" sentinel (e.g. always-flag agents).
      if (!isNum(o.autoSendAtConfidence) || o.autoSendAtConfidence < 0)
        errors.push("agent.output.autoSendAtConfidence must be ≥ 0");
      if (!isNum(o.degradedConfidence) || o.degradedConfidence < 0 || o.degradedConfidence > 1)
        errors.push("agent.output.degradedConfidence must be 0..1");
      if (!isStr(o.defaultAction)) errors.push("agent.output.defaultAction is required");
    }
    if (!isArr(a.risks)) errors.push("agent.risks must be an array");
  }

  if (!isArr(d.knowledge)) {
    errors.push("knowledge must be an array");
  } else {
    d.knowledge.forEach((pack, i) => {
      const pk = pack as Partial<OkfPack>;
      if (!isStr(pk.key) || !pk.key.trim()) errors.push(`knowledge[${i}].key is required`);
      if (!isArr(pk.items)) errors.push(`knowledge[${i}].items must be an array`);
      else
        pk.items.forEach((it, j) => {
          const item = it as Partial<OkfKnowledgeItem>;
          if (!isStr(item.code) || !item.code.trim()) errors.push(`knowledge[${i}].items[${j}].code is required`);
          if (!isStr(item.title)) errors.push(`knowledge[${i}].items[${j}].title is required`);
        });
    });
  }
  return { ok: errors.length === 0, errors };
}
