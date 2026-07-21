// ── oKF generic agent runtime ────────────────────────────────────────
//
// One execution harness that runs ANY AgentDefinition (oKF document). The
// eleven hardcoded agents collapse into data; this file is the code that
// remains — deliberately, because it is the governance boundary:
//
//   route → render prompt from spec + knowledge → call Claude (@aegis/ai)
//   → parse → map confidence to action → buildRec.
//
// The JSON→plain-text→degraded reliability ladder (the #208 fix that
// stopped large contracts degrading to "Claude unavailable") lives HERE,
// so every agent inherits it instead of re-implementing it.
//
// GOVERNANCE INVARIANT: runDefinition only PRODUCES a recommendation. It
// never sends, never mutates. The PENDING AgentDecision + human approve
// keystroke are enforced by the persistence layer (run-server.ts /
// storage/server.ts), unchanged. No oKF field can bypass that.
//
// Pure + dependency-injected (callClaude/callClaudeJSON/buildRec passed in)
// so it runs identically in the browser, on the server, and under vitest.

/** Compile an oKF routing block into a canHandle(ticket) predicate. */
export function fromRoutingJson(routing) {
  const r = routing || {};
  const cat = (r.matchCategory || []).map((s) => String(s).toLowerCase());
  const typ = (r.matchType || []).map((s) => String(s).toLowerCase());
  const kw = (r.matchKeyword || []).map((s) => String(s).toLowerCase());
  const excl = (r.excludeKeyword || []).map((s) => String(s).toLowerCase());
  const requiresDoc = r.requiresDocument === true;
  return function canHandle(ticket) {
    const category = String((ticket && ticket.aiTriage && ticket.aiTriage.category) || "").toLowerCase();
    const type = String((ticket && ticket.type) || "").toLowerCase();
    const desc = String((ticket && ticket.desc) || "").toLowerCase();
    if (excl.some((e) => e && desc.includes(e))) return false;
    if (requiresDoc && ticket && ticket.hasDocument !== true) return false;
    const hit =
      cat.some((c) => c && category.includes(c)) ||
      typ.some((t) => t && type.includes(t)) ||
      kw.some((k) => k && desc.includes(k));
    return hit;
  };
}

/** {{a.b}} → ctx["a.b"]; unknown placeholders render empty. */
export function renderTemplate(template, ctx) {
  if (!template) return "";
  return String(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = ctx[key];
    return v == null ? "" : String(v);
  });
}

/** Does a cohort's selector match this ticket? (type-based for now.) */
function cohortMatches(cohort, ticket) {
  const sel = (cohort && cohort.selector) || {};
  const type = String((ticket && ticket.type) || "").toLowerCase();
  const cat = String((ticket && ticket.aiTriage && ticket.aiTriage.category) || "").toLowerCase();
  const matchType = (sel.matchType || []).map((s) => String(s).toLowerCase());
  if (matchType.length === 0) return false;
  return matchType.some((t) => t && (type.includes(t) || cat.includes(t)));
}

/**
 * Select the knowledge items that apply to a ticket. Items with no
 * cohortTags are always-on; tagged items are included only when one of
 * their cohorts matches the ticket. Returns items across all packs.
 */
export function selectItemsForTicket(packs, ticket) {
  const out = [];
  for (const pack of packs || []) {
    const matchedTags = new Set();
    for (const c of pack.cohorts || []) {
      if (cohortMatches(c, ticket)) matchedTags.add(c.tag);
    }
    for (const item of pack.items || []) {
      const tags = item.cohortTags || [];
      if (tags.length === 0 || tags.some((t) => matchedTags.has(t))) out.push(item);
    }
  }
  return out;
}

/** Render selected items into a prose block for the prompt. */
export function renderKnowledge(items) {
  if (!items || items.length === 0) return "";
  return items
    .slice()
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map((it) => {
      const head = it.title ? `- ${it.title}` : `- ${it.code}`;
      const body = (it.bodyMarkdown || "").trim();
      return body ? `${head}: ${body}` : head;
    })
    .join("\n");
}

/** confidence → suggestedAction per the output thresholds. */
export function mapConfidenceToAction(confidence, output) {
  const o = output || {};
  const threshold = typeof o.autoSendAtConfidence === "number" ? o.autoSendAtConfidence : 0.85;
  const c = typeof confidence === "number" ? confidence : 0;
  return c >= threshold ? o.autoSendAction || "approve-and-send" : o.defaultAction || "flag-for-review";
}

/**
 * Run the agent's declared tool providers and return their outputs as
 * {{tool.<name>}} context variables. Tools provide deterministic CONTEXT
 * (a record pull, a lookup) — they never gate the action. A tool that
 * throws or isn't provided degrades to a short "(unavailable)" note so the
 * agent still runs. `tools` is the injected provider map (name → fn(ticket)).
 */
export async function resolveTools(ticket, doc, tools) {
  const out = {};
  const names = (doc.agent && doc.agent.tools) || [];
  for (const name of names) {
    const fn = tools && tools[name];
    if (typeof fn !== "function") { out[`tool.${name}`] = `(${name}: not available)`; continue; }
    try {
      const v = await fn(ticket);
      out[`tool.${name}`] = typeof v === "string" ? v : v == null ? "" : String(v.text != null ? v.text : v);
    } catch {
      out[`tool.${name}`] = `(${name}: unavailable)`;
    }
  }
  return out;
}

/** Build the {{variable}} context for a ticket + resolved knowledge. */
export function buildPromptContext(ticket, knowledgeText, doc) {
  const from = String((ticket && ticket.from) || "");
  const firstName = from.split(" ")[0] || "there";
  const maxDocChars = (doc && doc.agent && doc.agent.model && doc.agent.model.maxDocChars) || 9000;
  const desc = String((ticket && ticket.desc) || "").slice(0, maxDocChars);
  return {
    "ticket.from": from,
    "ticket.firstName": firstName,
    "ticket.dept": String((ticket && ticket.dept) || ""),
    "ticket.type": String((ticket && ticket.type) || ""),
    "ticket.desc": desc,
    knowledge: knowledgeText,
    playbook: knowledgeText,
  };
}

/**
 * Execute an oKF document against a ticket and return a recommendation.
 *
 * deps: { callClaude, callClaudeJSON, buildRec, buildDegradedRec,
 *         friendlyAIError }  — injected so the harness is transport-agnostic
 * and unit-testable. `knowledge` is the agent's resolved packs (may be []).
 */
export async function runDefinition(ticket, doc, knowledge, deps) {
  const { callClaude, callClaudeJSON, buildRec, buildDegradedRec, friendlyAIError, tools } = deps;
  const agent = doc.agent;
  const output = agent.output || {};
  const model = agent.model || {};
  const modelOpts = { maxTokens: model.maxTokens || 1500, timeout: model.timeout || 30000 };
  if (model.model) modelOpts.model = model.model;
  if (typeof model.temperature === "number") modelOpts.temperature = model.temperature;

  const items = selectItemsForTicket(knowledge, ticket);
  const knowledgeText = renderKnowledge(items);
  // Resolve declared tool providers into {{tool.*}} context (oKF-7).
  const toolCtx = await resolveTools(ticket, doc, tools);
  const ctx = { ...buildPromptContext(ticket, knowledgeText, doc), ...toolCtx };
  const system = renderTemplate(agent.prompt.systemTemplate, ctx);
  const precedentLinks = output.precedentLinks || [];
  // Deterministic concerns prepended to every rec, whatever Claude returns.
  const alwaysConcerns = (output.alwaysConcerns || []).map((c) => renderTemplate(c, ctx));

  // Path 1 — structured JSON (when the def asks for it).
  if (agent.prompt.mode === "json") {
    try {
      const prompt = agent.prompt.jsonContract
        ? `${system}\n\n${renderTemplate(agent.prompt.jsonContract, ctx)}`
        : system;
      const result = await callClaudeJSON(prompt, modelOpts);
      const confidence = typeof result.confidence === "number" ? result.confidence : 0.6;
      return buildRec(agent.key, {
        confidence,
        suggestedAction: mapConfidenceToAction(confidence, output),
        draftedResponse: result.draftedResponse || "",
        reasoning: result.reasoning || "AI recommendation.",
        concerns: [...alwaysConcerns, ...(Array.isArray(result.concerns) ? result.concerns : [])],
        precedentLinks,
        alternativeTone: result.alternativeTone || null,
      });
    } catch (e) {
      if (typeof console !== "undefined") console.error(`[okf:${agent.key}] JSON path failed, retrying as text:`, e);
      // fall through to the plain-text ladder
    }
  }

  // Path 2 — plain text (the reliability fallback; also the primary path
  // for mode="text" agents). Prose can't truncate into an unparseable
  // object, which is why it survives large documents.
  try {
    const textTemplate = agent.prompt.fallbackTemplate || agent.prompt.systemTemplate;
    const prompt = renderTemplate(textTemplate, ctx);
    // Honor the definition's token budget — a hard 1400 cap here truncated
    // long clause-by-clause contract reviews mid-sentence. The def's maxTokens
    // (editable in Agent Designer → Model) is the single source of truth.
    const prose = await callClaude(prompt, { maxTokens: modelOpts.maxTokens, timeout: modelOpts.timeout });
    const clean = (prose || "").trim();
    if (!clean) throw new Error("Empty plain-text response");
    const degraded = typeof output.degradedConfidence === "number" ? output.degradedConfidence : 0.4;
    // A text-mode agent is at full strength here; a JSON-mode agent that
    // fell through is degraded-but-real — halfway between degraded and auto.
    const confidence = agent.prompt.mode === "text" ? 0.7 : Math.max(degraded, 0.55);
    return buildRec(agent.key, {
      confidence,
      suggestedAction: mapConfidenceToAction(confidence, output),
      draftedResponse: clean,
      reasoning: agent.prompt.mode === "text" ? "AI recommendation." : "AI recommendation (produced as plain text).",
      concerns: [...alwaysConcerns],
      precedentLinks,
    });
  } catch (e2) {
    if (typeof console !== "undefined") console.error(`[okf:${agent.key}] plain-text fallback failed:`, e2);
    return buildDegradedRec(agent.key, {
      draftedResponse: "",
      reasoning: "Claude unavailable — surfaced for manual review (not auto-send).",
      concerns: [...alwaysConcerns, friendlyAIError ? friendlyAIError(e2) : "AI unavailable", "Manual review required."],
      precedentLinks,
    });
  }
}
