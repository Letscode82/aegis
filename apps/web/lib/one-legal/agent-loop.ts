/**
 * ONE Legal agent loop (A1) — a bounded ReAct-style research loop.
 *
 * The console's answer paths so far are single-hop (retrieve → answer). This is
 * the multi-step primitive: plan → act → observe → iterate. Given a question,
 * a Claude "controller" repeatedly chooses a READ tool (semantic search over the
 * org's documents, or read one document in full), observes the result, and loops
 * until it can answer — citing the sources it used.
 *
 * Governance is preserved by construction: the loop's tools are READ-ONLY. No
 * mutation ever runs autonomously here — creating a matter, drafting a contract,
 * etc. stays on the existing propose → human Approve → AgentDecision → act path.
 * A1 makes the console *reason* over more context; it does not widen what it can
 * change without a human.
 *
 * Degrades: if Claude is unavailable it falls back to a single retrieval + an
 * extractive answer, so the loop always returns something useful.
 */
import { callClaudeJSON } from "@aegis/ai";
import { ensureServerClaudeTransport } from "@aegis/ai/server";
import { semanticSearch } from "@aegis/search";
import { prisma } from "@aegis/db";

export interface AgentSource {
  n: number;
  documentId: string | null;
  name: string;
  ownerType: string;
  ownerId: string;
  snippet: string;
  score: number;
  retrieval: string;
  navigate: string | null;
}

export interface AgentStep {
  thought: string;
  action: string; // human-readable: "search: <q>" | "read: <name>" | "answer"
  observation: string; // short summary of what came back
}

export interface AgentResult {
  answer: string;
  sources: AgentSource[];
  steps: AgentStep[];
  degraded: boolean;
}

const MAX_STEPS = 5;
const READ_CHARS = 4000;

function navigateForOwner(ownerType: string | null): string | null {
  switch ((ownerType || "").toUpperCase()) {
    case "INTAKE":
      return "intake";
    case "MATTER":
      return "matters";
    case "CONTRACT":
      return "contracts";
    default:
      return null;
  }
}

type Controller =
  | { thought?: string; action?: { type: "search"; query?: string } }
  | { thought?: string; action?: { type: "read"; source?: number } }
  | { thought?: string; action?: { type: "final"; answer?: string; citations?: number[] } };

const SYSTEM =
  "You are AEGIS's research controller for a corporate legal-operations team. You answer a question by iteratively " +
  "using READ-ONLY tools over the organization's own documents, then citing what you used. Respond with STRICT JSON " +
  "for ONE next step only:\n" +
  '  {"thought":"<one sentence>","action":{"type":"search","query":"<focused query>"}}\n' +
  '  {"thought":"<one sentence>","action":{"type":"read","source":<source number>}}\n' +
  '  {"thought":"<one sentence>","action":{"type":"final","answer":"<answer citing [n]>","citations":[n,...]}}\n' +
  "Rules: search when you need to find relevant documents; read when a specific source looks decisive and you need its full text; " +
  "finalise as soon as you can answer. Cite sources inline as [n]. Never invent facts, names, or numbers not in the sources. " +
  "You cannot create, edit, or send anything — you only read. If the documents don't answer it, say so in the final answer.";

/** Fallback: one retrieval + a deterministic extractive answer. */
async function degradedAnswer(organizationId: string, question: string): Promise<AgentResult> {
  let sources: AgentSource[] = [];
  try {
    const hits = await semanticSearch({ organizationId, query: question, ownerTypes: ["DOCUMENT"], limit: 5 });
    sources = await toSources(organizationId, hits, 0);
  } catch {
    sources = [];
  }
  const answer = sources.length
    ? "Based on your documents:\n\n" +
      sources.slice(0, 3).map((s) => `• ${s.name} [${s.n}]: ${s.snippet.slice(0, 200)}${s.snippet.length > 200 ? "…" : ""}`).join("\n\n") +
      "\n\n(Research AI is offline; showing the most relevant excerpts. A qualified lawyer should review.)"
    : "I couldn't find anything in your documents for that, and research AI is offline right now.";
  return { answer, sources, steps: [], degraded: true };
}

type Hit = { ownerType: string; ownerId: string; documentId: string | null; content: string; score: number; source: string };

/** Resolve document names + navigation for a batch of hits, numbering from `startN`. */
async function toSources(organizationId: string, hits: Hit[], startN: number): Promise<AgentSource[]> {
  const docIds = Array.from(new Set(hits.map((h) => h.documentId).filter((v): v is string => !!v)));
  const docs = docIds.length
    ? await prisma.document.findMany({ where: { id: { in: docIds }, organizationId }, select: { id: true, name: true, ownerType: true, ownerId: true } })
    : [];
  const docMap = new Map(docs.map((d) => [d.id, d]));
  const out: AgentSource[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    const key = h.documentId || `${h.ownerType}:${h.ownerId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const meta = h.documentId ? docMap.get(h.documentId) : undefined;
    const ownerType = meta?.ownerType != null ? String(meta.ownerType) : h.ownerType;
    out.push({
      n: startN + out.length + 1,
      documentId: h.documentId,
      name: meta?.name || (h.content.slice(0, 60).trim() || "Document"),
      ownerType,
      ownerId: meta?.ownerId || h.ownerId,
      snippet: h.content.slice(0, 500).trim(),
      score: Math.round((h.score || 0) * 1000) / 1000,
      retrieval: h.source,
      navigate: navigateForOwner(ownerType),
    });
  }
  return out;
}

export async function runAgentLoop(input: { organizationId: string; question: string; maxSteps?: number }): Promise<AgentResult> {
  const { organizationId, question } = input;
  const maxSteps = Math.min(Math.max(1, input.maxSteps ?? MAX_STEPS), 8);

  try {
    ensureServerClaudeTransport();
  } catch {
    return degradedAnswer(organizationId, question);
  }

  const sources: AgentSource[] = [];
  const steps: AgentStep[] = [];
  const transcript: string[] = [];

  const sourcesTable = () => (sources.length ? sources.map((s) => `[${s.n}] ${s.name}: ${s.snippet.slice(0, 140)}`).join("\n") : "(none yet)");

  for (let i = 0; i < maxSteps; i++) {
    const prompt =
      `Question: ${question}\n\n` +
      `Known sources:\n${sourcesTable()}\n\n` +
      (transcript.length ? `Progress so far:\n${transcript.join("\n")}\n\n` : "") +
      (i === maxSteps - 1 ? "This is your LAST step — you must return a final answer now.\n" : "") +
      "Return the next step as strict JSON.";

    let ctrl: Controller | null = null;
    try {
      ctrl = (await callClaudeJSON(prompt, { system: SYSTEM, maxTokens: 700, timeout: 20000 })) as Controller;
    } catch {
      break; // controller failed mid-loop → synthesise from what we have below
    }
    const action = ctrl?.action;
    const thought = (ctrl?.thought || "").toString().slice(0, 200);

    if (!action || action.type === "final") {
      const answer = (action && action.type === "final" ? action.answer : "") || "";
      if (answer.trim()) {
        const cites = action && action.type === "final" && Array.isArray(action.citations) ? action.citations : [];
        const used = cites.length ? sources.filter((s) => cites.includes(s.n)) : sources;
        steps.push({ thought: thought || "Answering", action: "answer", observation: "" });
        return { answer: answer.trim(), sources: used.length ? used : sources, steps, degraded: false };
      }
      break; // empty final → synthesise below
    }

    if (action.type === "search") {
      const query = (action.query || question).toString().slice(0, 300);
      let added = 0;
      try {
        const hits = await semanticSearch({ organizationId, query, ownerTypes: ["DOCUMENT"], limit: 6 });
        const fresh = await toSources(organizationId, hits, sources.length);
        // Keep only genuinely new documents.
        for (const s of fresh) {
          if (!sources.some((e) => e.documentId && e.documentId === s.documentId)) {
            sources.push({ ...s, n: sources.length + 1 });
            added += 1;
          }
        }
      } catch { /* observation notes zero */ }
      const obs = `found ${added} new source(s)`;
      steps.push({ thought, action: `search: ${query}`, observation: obs });
      transcript.push(`Step ${i + 1}: searched "${query}" → ${obs}.`);
      continue;
    }

    if (action.type === "read") {
      const n = Number(action.source);
      const src = sources.find((s) => s.n === n);
      if (!src || !src.documentId) {
        steps.push({ thought, action: `read: [${n}]`, observation: "not found" });
        transcript.push(`Step ${i + 1}: tried to read [${n}] but it isn't a known source.`);
        continue;
      }
      let text = "";
      try {
        const doc = await prisma.document.findFirst({ where: { id: src.documentId, organizationId }, select: { extractedText: true } });
        text = (doc?.extractedText || "").slice(0, READ_CHARS);
      } catch { /* leave empty */ }
      steps.push({ thought, action: `read: ${src.name}`, observation: text ? `${text.length} chars` : "no text" });
      transcript.push(`Step ${i + 1}: read [${n}] ${src.name}:\n${text || "(no extractable text)"}`);
      continue;
    }

    break; // unknown action shape
  }

  // Loop ended without an explicit final — synthesise one grounded answer.
  if (sources.length === 0) return degradedAnswer(organizationId, question);
  try {
    const context = sources.map((s) => `[${s.n}] ${s.name}\n${s.snippet}`).join("\n\n");
    const answer = ((await callClaudeJSON(
      `Question: ${question}\n\nSources:\n${context}\n\n${transcript.join("\n")}`,
      { system: 'Answer the question from the sources, citing [n]. Return STRICT JSON {"answer":"..."}. Do not invent facts.', maxTokens: 700, timeout: 20000 },
    )) as { answer?: string }).answer;
    if (answer && answer.trim()) return { answer: answer.trim(), sources, steps, degraded: false };
  } catch { /* fall through */ }
  return degradedAnswer(organizationId, question);
}
