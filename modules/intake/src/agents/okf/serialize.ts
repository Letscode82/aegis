/**
 * oKF canonical serialization — the "open format" surface.
 *
 * `canonicalStringify` renders any value with recursively-sorted object
 * keys so two structurally-equal documents produce byte-identical text
 * (the same discipline as versions.ts:canon). That canonical text is what
 * we hash for version detection and what export/import round-trips.
 *
 * `normalizeDocument` coerces a partial/loose object into a complete
 * `OkfDocument` with every default filled — so the Designer can save a
 * sparse draft and the runtime always sees a whole spec. `parseDocument`
 * validates then normalizes (the import path).
 */
import {
  OKF_VERSION,
  validateOkfDocument,
  type OkfDocument,
  type OkfAgent,
  type OkfPack,
  type OkfKnowledgeItem,
  type OkfCohort,
  type OkfValidationResult,
} from "./schema";

/** Recursively sort object keys; arrays keep order (semantic). */
function sortValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortValue((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

/** Stable, key-sorted JSON. Byte-identical for structurally-equal input. */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d);
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const strArr = (v: unknown): string[] => arr<unknown>(v).filter((x): x is string => typeof x === "string");
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function normalizeItem(raw: unknown, i: number): OkfKnowledgeItem {
  const o = obj(raw);
  const kind = str(o.kind, "REFERENCE") as OkfKnowledgeItem["kind"];
  return {
    code: str(o.code, `ITEM.${i}`),
    kind: (["CLAUSE", "RULE", "QA", "TEMPLATE", "REFERENCE"].includes(kind) ? kind : "REFERENCE") as OkfKnowledgeItem["kind"],
    title: str(o.title),
    bodyMarkdown: str(o.bodyMarkdown),
    data: obj(o.data),
    cohortTags: strArr(o.cohortTags),
    sortOrder: num(o.sortOrder, i),
  };
}

function normalizeCohort(raw: unknown, i: number): OkfCohort {
  const o = obj(raw);
  return {
    key: str(o.key, `cohort-${i}`),
    name: str(o.name, str(o.key, `Cohort ${i}`)),
    tag: str(o.tag),
    selector: obj(o.selector),
    sortOrder: num(o.sortOrder, i),
  };
}

function normalizePack(raw: unknown, i: number): OkfPack {
  const o = obj(raw);
  const kind = str(o.kind, "REFERENCE") as OkfPack["kind"];
  return {
    key: str(o.key, `pack-${i}`),
    name: str(o.name, str(o.key, `Pack ${i}`)),
    description: strOrNull(o.description),
    kind: kind as OkfPack["kind"],
    items: arr(o.items).map(normalizeItem),
    cohorts: arr(o.cohorts).map(normalizeCohort),
  };
}

function normalizeAgent(raw: unknown): OkfAgent {
  const o = obj(raw);
  const routing = obj(o.routing);
  const model = obj(o.model);
  const prompt = obj(o.prompt);
  const output = obj(o.output);
  const playbook = obj(o.playbook);
  const promptMode = str(prompt.mode, "json") === "text" ? "text" : "json";
  return {
    key: str(o.key),
    name: str(o.name),
    shortName: strOrNull(o.shortName),
    icon: strOrNull(o.icon),
    description: strOrNull(o.description),
    enabled: bool(o.enabled, true),
    productionReady: bool(o.productionReady, true),
    displayOrder: num(o.displayOrder, 0),
    executionMode: str(o.executionMode, "code") === "okf" ? "okf" : "code",
    routing: {
      matchCategory: strArr(routing.matchCategory),
      matchType: strArr(routing.matchType),
      matchKeyword: strArr(routing.matchKeyword),
      excludeKeyword: strArr(routing.excludeKeyword),
      requiresDocument: bool(routing.requiresDocument, false),
    },
    model: {
      model: strOrNull(model.model),
      maxTokens: num(model.maxTokens, 1500),
      timeout: num(model.timeout, 30000),
      temperature: numOrNull(model.temperature),
      maxDocChars: num(model.maxDocChars, 9000),
    },
    prompt: {
      mode: promptMode,
      systemTemplate: str(prompt.systemTemplate),
      jsonContract: strOrNull(prompt.jsonContract),
      fallbackTemplate: strOrNull(prompt.fallbackTemplate),
      variables: strArr(prompt.variables),
    },
    output: {
      autoSendAtConfidence: num(output.autoSendAtConfidence, 0.85),
      degradedConfidence: num(output.degradedConfidence, 0.4),
      defaultAction: str(output.defaultAction, "flag-for-review"),
      autoSendAction: str(output.autoSendAction, "approve-and-send"),
      precedentLinks: arr(output.precedentLinks)
        .map((p) => obj(p))
        .filter((p) => typeof p.id === "string")
        .map((p) => ({ id: str(p.id), title: str(p.title) })),
    },
    risks: strArr(o.risks),
    playbook: { id: str(playbook.id), version: str(playbook.version) },
    approverRole: strOrNull(o.approverRole),
  };
}

/** Coerce any loose object into a complete OkfDocument (defaults filled). */
export function normalizeDocument(raw: unknown): OkfDocument {
  const o = obj(raw);
  return {
    okfVersion: OKF_VERSION,
    agent: normalizeAgent(o.agent),
    knowledge: arr(o.knowledge).map(normalizePack),
  };
}

/** Canonical text for a document (post-normalization) — the hash input. */
export function serializeDocument(doc: OkfDocument): string {
  return canonicalStringify(normalizeDocument(doc));
}

export interface ParseResult {
  ok: boolean;
  document: OkfDocument | null;
  validation: OkfValidationResult;
}

/** The import path: validate the raw input, then normalize on success. */
export function parseDocument(raw: unknown): ParseResult {
  const validation = validateOkfDocument(raw);
  if (!validation.ok) return { ok: false, document: null, validation };
  return { ok: true, document: normalizeDocument(raw), validation };
}
