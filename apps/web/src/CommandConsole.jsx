import { useState, useEffect, useRef, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";
import { friendlyAIError } from "@aegis/ai";
import { SKILLS } from "../lib/one-legal/skills";

// Command Console (WS-1, agentic) — "ONE Legal", the full-page front door,
// built to feel like a first-class AI workspace (Harvey / Legora / Claude).
//
// It is intent-aware. A REQUEST ("create an NDA for Acme") is planned into
// steps that stream from the real /api/intake/request-stream pipeline and
// ends in a routed ticket card that deep-links to the ticket. A QUESTION
// ("what can you do?", "how does a legal hold work?") is ANSWERED — it does
// NOT file a ticket. Capability questions get a built-in overview; other
// questions are answered via @aegis/ai (routes through /api/claude), with a
// graceful fallback when the model is unavailable.
//
// Renders two ways: as a nav destination (`embedded`, filling the content
// area) and as a full-screen overlay opened from the header omnibox.

const wait = (ms) => new Promise((res) => setTimeout(res, ms));
let TURN_SEQ = 0;

// Example prompts for the empty landing — one-click starts across the modules.
const EXAMPLES = [
  { icon: "✎", text: "Create a mutual NDA for Acme Corp" },
  { icon: "⇤", text: "Review a third-party MSA from Deloitte" },
  { icon: "⚖", text: "Start a legal hold on the Snowflake matter" },
  { icon: "◎", text: "Flag a new vendor for sanctions screening" },
  { icon: "◷", text: "File a privacy DSAR for a data subject" },
  { icon: "▤", text: "Draft an SOW for outside counsel" },
  { icon: "✎", text: "Draft a memo summarizing our data-retention policy" },
];

// Rotating one-liner shown as a pinned tip above the composer on the landing.
const TIPS = [
  "Describe a whole situation — “we’re being sued by Acme” — and I’ll break it into tasks.",
  "Ask a question and I’ll answer it; only real requests get filed and routed.",
  "I can open a matter, draft a contract, file a DSAR, or start a legal hold — you approve each action.",
  "Every action I take is logged to the chain-sealed audit ledger and needs your approval.",
];

// What AEGIS can take on — the capability answer.
const CAPABILITIES = [
  { k: "Intake & routing", v: "File any legal request in plain language — I classify it, apply your routing rules, and send it to the right desk." },
  { k: "Contracts", v: "Draft or review NDAs, MSAs, SOWs, DPAs, and run third-party paper through the clause playbook." },
  { k: "Matters & Legal Hold", v: "Open a matter, issue or release a legal hold, and track custodians." },
  { k: "Privacy", v: "File and track DSARs and flag privacy incidents." },
  { k: "Risk & vendors", v: "Screen vendors for sanctions and flag regulatory obligations." },
  { k: "Ask anything", v: "Or just ask a question about a matter, a policy, or how something works — I'll answer, not file a ticket." },
];

// ── Intent classification (client-side, deterministic) ────────────────
// A QUESTION is answered; anything else is filed. Imperative phrasing
// ("can you draft an NDA?") is still a request even though it ends in "?".
const CAPABILITY_RE = /(what can (you|aegis|i)|what do you do|how does (this|aegis|it) work|what is this|who are you|what are you|your capabilities|^help$|^help me$|^hi$|^hey$|^hello$)/i;
const QUESTION_RE = /\?\s*$|^(what|whats|what's|how|why|who|whom|whose|when|where|which|can|could|do|does|did|is|are|am|should|would|will|tell me|explain|show me|list|help)\b/i;
const IMPERATIVE_RE = /^(please\s+)?(create|draft|review|file|start|open|prepare|set ?up|renew|terminate|flag|screen|onboard|redline|negotiate|raise|issue|log|submit|make|generate|build)\b|^(i|we)\s+(need|want|would like|require)\b|\b(can|could|please)\s+you\s+(create|draft|review|file|start|prepare|renew|flag|screen|set ?up|make|open|handle|generate|build)\b/i;

// Operational / analytical queries about EXISTING module data ("total open
// contracts", "open matters", "active holds", "overdue invoices") are questions
// to answer from the Contracts / Matter / Spend / … modules — NOT new requests
// to file. They often arrive as a bare noun phrase with no leading question
// word, so QUESTION_RE misses them and they fall through to "file". Mirror the
// server's looksOperational (apps/web/lib/one-legal/org-snapshot.ts).
const OPS_AGG_RE = /\b(total|open|pending|overdue|outstanding|active|all|how many|number of|count|breakdown|summary|overview|status|due)\b/i;
const OPS_MODULE_RE = /\b(contracts?|matters?|tickets?|intake|invoices?|spend|budgets?|holds?|legal holds?|custodians?|dsars?|privacy|obligations?|renewals?|vendors?|counterpart(?:y|ies)|cases?)\b/i;
// A real filing imperative names a NEW thing to open ("open a matter", "create
// an NDA", "file a new request") — a verb immediately followed by an article.
// This keeps "open a matter for Acme" on the file path while "open matters"
// (no article) is read as an operational question.
const IMPERATIVE_WITH_OBJECT_RE = /^(please\s+)?(create|draft|review|file|start|open|prepare|set ?up|renew|terminate|flag|screen|onboard|redline|negotiate|raise|issue|log|submit|make|generate|build)\s+(a|an|the|new|me)\b/i;
function looksOperationalQuery(t) {
  return OPS_AGG_RE.test(t) && OPS_MODULE_RE.test(t);
}

function classifyIntent(text) {
  const t = text.trim().toLowerCase();
  if (CAPABILITY_RE.test(t)) return "capability";
  // Aggregate/analytical queries over existing module data are questions even
  // without a leading question word — unless they're a clear filing imperative
  // ("open a matter …") or a tool-y request.
  if (looksOperationalQuery(t) && !IMPERATIVE_WITH_OBJECT_RE.test(t) && !looksToolish(t)) return "ask";
  if (QUESTION_RE.test(t) && !IMPERATIVE_RE.test(t)) return "ask";
  return "file";
}

// C1 — "draft a memo / email / clause / summary …" opens the editable canvas.
// Formal instruments (NDA, MSA, agreement, …) stay on the governed
// contracts.draft tool path, so those are explicitly excluded here.
const CANVAS_DRAFT_RE = /^\s*(draft|write|compose|prepare|create|make)\s+(me\s+)?(a|an|the)?\s*(memo|e-?mail|letter|note|clause|summary|outline|talking[ -]points|brief|blurb|paragraph|response|reply|statement)\b/i;
const CONTRACT_NOUN_RE = /\b(nda|non-disclosure|agreement|contract|msa|sow|dpa|terms of service|tos)\b/i;
function looksLikeCanvasDraft(text) {
  const t = text.trim();
  return CANVAS_DRAFT_RE.test(t) && !CONTRACT_NOUN_RE.test(t);
}

// Conservative check for whether a request might contain several asks — used
// to decide when to pay the /plan round-trip. Simple requests skip it.
function looksCompound(text) {
  const t = text.trim();
  if (/\n/.test(t)) return true;
  if (/(^|\s)(?:\d+[.)]|[-*•])\s/.test(t)) return true;
  if (/;/.test(t)) return true;
  if (t.length > 60 && /\b(and also|and then|then|plus|also)\b/i.test(t)) return true;
  if (t.length > 80 && /\band\b/i.test(t)) return true;
  return false;
}

// Mirrors the server tool selectors so single tool-y requests also route
// through /plan (to surface a governed tool proposal), while pure intake
// requests stay on the instant path.
function looksToolish(text) {
  const t = text.trim().toLowerCase();
  return /\b(open|start|create|file|spin up)\b[^.]*\bmatter\b/.test(t) || /\bmatter\b[^.]*\b(for|on)\b/.test(t) || /\b(sued|lawsuit|litigation matter)\b/.test(t)
    || /\b(draft|create|prepare|author|generate|write|new)\b[^.]*\b(nda|msa|sow|dpa|contract|agreement|licen[cs]e)\b/.test(t)
    || /\bdsar\b|data subject (access|request|erasure)|right to (be forgotten|erasure|access)|(access|erasure|deletion) request/.test(t)
    || /\b(legal hold|litigation hold|preservation hold)\b|\bput\b[^.]*\bon hold\b|\bpreserve\b[^.]*\b(documents|evidence|data)\b/.test(t)
    || /\b(invoice|bill|legal spend)\b[^.]*\b(review|audit|check|scrub)\b|\breview\b[^.]*\b(invoice|bill)\b/.test(t);
}

function baseSteps() {
  return [
    { key: "read", label: "Reading your request", state: "pending", detail: null },
    { key: "classify", label: "Classifying the matter", state: "pending", detail: null },
    { key: "route", label: "Applying routing rules", state: "pending", detail: null },
    { key: "file", label: "Filing the intake ticket", state: "pending", detail: null },
    { key: "done", label: "Ready for triage", state: "pending", detail: null },
  ];
}

function StepRow({ step }) {
  const { state, label, detail } = step;
  const done = state === "done";
  const active = state === "active";
  const err = state === "error";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", opacity: state === "pending" ? 0.5 : 1 }}>
      <span style={{ width: 16, height: 16, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }} aria-hidden="true">
        {done ? <span style={{ color: C.gn, fontSize: 13 }}>✓</span>
          : err ? <span style={{ color: C.rd, fontSize: 13 }}>✕</span>
          : active ? <span style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid ${C.br}`, borderTopColor: C.em, display: "inline-block", animation: "sp .7s linear infinite" }} />
          : <span style={{ width: 9, height: 9, borderRadius: "50%", border: `1.5px solid ${C.br}`, display: "inline-block" }} />}
      </span>
      <span style={{ fontSize: 12.5, color: done ? C.t3 : err ? C.rd : C.t1, textDecoration: done ? "line-through" : "none", textDecorationColor: C.t4 }}>{label}</span>
      {detail && <span style={{ fontSize: 11.5, fontFamily: M, color: done ? C.tl : C.t3 }}>{detail}</span>}
    </div>
  );
}

function ResultCard({ result, onOpenTicket, onOpenCockpit, onFollowUp, onAsk }) {
  const c = result.classification;
  const matters = result.spawned?.matters || [];
  const contracts = result.spawned?.contracts || [];
  const spawnN = matters.length + contracts.length;
  const Field = ({ l, v, col }) => (
    <div><div style={{ fontSize: 8.5, fontFamily: M, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: 12.5, color: col || C.t1, marginTop: 2 }}>{v}</div></div>
  );
  return (
    <div style={{ marginTop: 12, border: `1px solid ${C.br}`, borderRadius: 12, background: C.cd, padding: 16, boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 15, fontFamily: SR }}>Filed {result.ticketId}</span>
        <span style={{ fontSize: 9, fontFamily: M, color: C.gn, border: `1px solid ${C.gn}`, borderRadius: 4, padding: "1px 7px", letterSpacing: 0.5, textTransform: "uppercase" }}>Routed</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 12, marginBottom: 14 }}>
        <Field l="Category" v={c.category} />
        <Field l="Routed to" v={c.team} />
        <Field l="Priority" v={c.priority} />
        <Field l="SLA" v={c.sla} />
      </div>
      {spawnN > 0 && (
        <div style={{ fontSize: 11.5, color: C.tl, fontFamily: M, marginBottom: 12, background: C.tlG, border: `1px solid ${C.tl}44`, borderRadius: 8, padding: "8px 10px" }}>
          ✦ Auto-spawned {matters.length > 0 ? `${matters.length} matter(s)` : ""}{matters.length > 0 && contracts.length > 0 ? " · " : ""}{contracts.length > 0 ? `${contracts.length} contract(s)` : ""} — already linked to this request.
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => onOpenTicket(result.ticketId)} style={primaryBtn}>Open ticket {result.ticketId} →</button>
        <button type="button" onClick={onOpenCockpit} style={ghostBtn}>Triage Cockpit</button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
        <span style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase" }}>Next</span>
        <button type="button" onClick={onFollowUp} style={chipBtn}>File a related request</button>
        {onAsk && <button type="button" onClick={onAsk} style={chipBtn}>◎ Ask Aurora about this</button>}
      </div>
    </div>
  );
}

// Compound execution window — a request decomposed into several tasks, each
// running the governed pipeline in its own slot (Cowork-style).
function taskDot(task) {
  if (task.error) return <span style={{ color: C.rd, fontSize: 13 }}>✕</span>;
  if (task.result || task.toolResult) return <span style={{ color: C.gn, fontSize: 13 }}>✓</span>;
  if (task.state === "awaiting") return <span style={{ width: 9, height: 9, borderRadius: "50%", background: C.am, display: "inline-block" }} />;
  if (task.state === "running") return <span style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid ${C.br}`, borderTopColor: C.em, display: "inline-block", animation: "sp .7s linear infinite" }} />;
  return <span style={{ width: 9, height: 9, borderRadius: "50%", border: `1.5px solid ${C.br}`, display: "inline-block" }} />;
}

// Picker for a tool that acts on an existing resource (e.g. choose the matter
// a legal hold attaches to). Fetches options lazily from /targets.
function TargetPicker({ kind, value, onChange }) {
  const [opts, setOpts] = useState(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/one-legal/targets?kind=${encodeURIComponent(kind)}`).then((r) => r.json()).then((d) => { if (live) setOpts(d.ok ? (d.items || []) : []); }).catch(() => { if (live) setOpts([]); });
    return () => { live = false; };
  }, [kind]);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", marginBottom: 10, background: C.cd, border: `1px solid ${C.brL}`, borderRadius: 8, color: C.t1, fontFamily: F, fontSize: 12.5, padding: "8px 10px" }}>
      <option value="">{opts === null ? "Loading…" : opts.length ? "Select a matter…" : "No matters found"}</option>
      {(opts || []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
}

function ToolProposal({ task, onApprove, onFileInstead }) {
  const [targetId, setTargetId] = useState("");
  const needs = task.tool.needsTarget;
  const ready = !needs || !!targetId;
  return (
    <div style={{ border: `1px solid ${C.am}55`, background: C.amG, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 9, fontFamily: M, color: C.am, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 5 }}>Proposed action · needs your approval</div>
      <div style={{ fontSize: 12.5, color: C.t1, marginBottom: 10 }}>{task.tool.argsSummary}</div>
      {needs && <TargetPicker kind={needs.kind} value={targetId} onChange={setTargetId} />}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => onApprove(task, targetId)} disabled={!ready} style={{ ...primaryBtn, opacity: ready ? 1 : 0.5 }}>Approve &amp; run →</button>
        <button type="button" onClick={() => onFileInstead(task)} style={ghostBtn}>File as ticket instead</button>
      </div>
    </div>
  );
}

function CompoundCard({ turn, onOpenTicket, onOpenCockpit, onFollowUp, onApprove, onFileInstead, onOpenNav }) {
  const done = turn.tasks.filter((t) => t.result || t.toolResult || t.error).length;
  return (
    <div>
      <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Plan · {done}/{turn.tasks.length} tasks</div>
      <div style={{ display: "grid", gap: 12 }}>
        {turn.tasks.map((task, i) => (
          <div key={task.id} style={{ border: `1px solid ${C.br}`, borderRadius: 12, background: C.cd, padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
              <span style={{ width: 16, display: "inline-flex", justifyContent: "center" }} aria-hidden="true">{taskDot(task)}</span>
              <span style={{ fontSize: 9, fontFamily: M, color: C.t4 }}>{i + 1}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{task.title}</span>
            </div>

            {/* Governed tool proposal — awaits the human Approve keystroke. */}
            {task.tool && task.state === "awaiting" ? (
              <ToolProposal task={task} onApprove={onApprove} onFileInstead={onFileInstead} />
            ) : (
              <div style={{ paddingLeft: 4 }}>{task.steps.map((s) => <StepRow key={s.key} step={s} />)}</div>
            )}

            {task.error && <div style={{ marginTop: 8, color: C.rd, fontFamily: M, fontSize: 12, background: C.rdG, border: `1px solid ${C.rd}44`, borderRadius: 8, padding: "8px 10px" }}>⚠ {task.error}</div>}
            {task.toolResult && (
              <div style={{ marginTop: 10, border: `1px solid ${C.br}`, borderRadius: 10, background: C.bg, padding: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontFamily: SR }}>Created {task.toolResult.resourceLabel}</span>
                <span style={{ fontSize: 9, fontFamily: M, color: C.gn, border: `1px solid ${C.gn}`, borderRadius: 4, padding: "1px 7px", letterSpacing: 0.5, textTransform: "uppercase" }}>{task.toolResult.label}</span>
                <button type="button" onClick={() => onOpenNav(task.toolResult.navigate)} style={{ ...primaryBtn, marginLeft: "auto" }}>Open →</button>
              </div>
            )}
            {task.result && <ResultCard result={task.result} onOpenTicket={onOpenTicket} onOpenCockpit={onOpenCockpit} onFollowUp={onFollowUp} onAsk={null} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// Retrieval sources behind a cited answer (K1.3). Numbered to match the [n]
// citations in the answer text; each opens the owning module where resolvable.
function SourcesList({ sources, grounded, onOpenSource }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div style={{ marginTop: 14, borderTop: `1px solid ${C.br}`, paddingTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase" }}>Sources · from your documents</span>
        {grounded && <span style={{ fontSize: 8.5, fontFamily: M, color: C.em, border: `1px solid ${C.em}`, borderRadius: 4, padding: "0 5px", letterSpacing: 0.5, textTransform: "uppercase" }}>grounded</span>}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {sources.map((s) => {
          const canOpen = s.navigate && onOpenSource;
          return (
            <button
              key={s.n}
              type="button"
              onClick={canOpen ? () => onOpenSource(s.navigate) : undefined}
              title={s.snippet}
              style={{ textAlign: "left", display: "flex", gap: 9, alignItems: "baseline", padding: "7px 9px", background: C.s1, border: `1px solid ${C.br}`, borderRadius: 8, cursor: canOpen ? "pointer" : "default" }}
            >
              <span style={{ fontSize: 10, fontFamily: M, color: C.em, flexShrink: 0 }}>[{s.n}]</span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 12, color: C.t1, fontWeight: 600, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                <span style={{ fontSize: 11, color: C.t3, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.snippet}</span>
              </span>
              <span style={{ fontSize: 8, fontFamily: M, color: C.t4, letterSpacing: 0.5, textTransform: "uppercase", flexShrink: 0 }}>{s.retrieval === "semantic" ? "◆ semantic" : "kw"}{canOpen ? " ·  open →" : ""}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Answer card for a QUESTION turn (capability overview, streamed answer, or
// the graceful fallback) — never files a ticket.
function AnswerCard({ turn, onExample, onFileInstead, onAsk, onOpenSource, onResearch }) {
  if (turn.capability) {
    return (
      <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, background: C.cd, padding: 16 }}>
        <div style={{ fontSize: 13.5, color: C.t1, lineHeight: 1.6, marginBottom: 12 }}>
          I&rsquo;m <strong>AEGIS</strong> — your one front door for legal. Describe what you need and I&rsquo;ll plan it, file it, and route it. Here&rsquo;s what I can take on:
        </div>
        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {CAPABILITIES.map((cap) => (
            <div key={cap.k} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span style={{ fontSize: 10.5, fontFamily: M, color: C.tl, letterSpacing: 0.3, minWidth: 148, flexShrink: 0 }}>{cap.k}</span>
              <span style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.5 }}>{cap.v}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>Try one</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {EXAMPLES.slice(0, 4).map((ex) => (
            <button key={ex.text} type="button" onClick={() => onExample(ex.text)} style={chipBtn}><span style={{ color: C.tl, marginRight: 6 }} aria-hidden="true">{ex.icon}</span>{ex.text}</button>
          ))}
        </div>
      </div>
    );
  }
  if (turn.answerLoading) {
    return (
      <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, background: C.cd, padding: 16, display: "flex", alignItems: "center", gap: 10, color: C.t3, fontFamily: M, fontSize: 12 }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid ${C.br}`, borderTopColor: C.em, display: "inline-block", animation: "sp .7s linear infinite" }} />
        Thinking…
      </div>
    );
  }
  return (
    <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, background: C.cd, padding: 16 }}>
      {turn.answerError ? (
        <div style={{ color: C.t2, fontSize: 13, lineHeight: 1.6 }}>
          <div style={{ color: C.am, fontFamily: M, fontSize: 11.5, marginBottom: 8 }}>⚠ {turn.answerError}</div>
          I couldn&rsquo;t answer that just now — but I can still file it as a request, or hand it to Aurora for a deeper look.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13.5, color: C.t1, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{turn.answer}</div>
          {Array.isArray(turn.nav) && turn.nav.length > 0 && onOpenSource && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {turn.nav.map((n) => (
                <button key={n.view} type="button" onClick={() => onOpenSource(n.view)} style={chipBtn}>Open {n.label} →</button>
              ))}
            </div>
          )}
          <SourcesList sources={turn.sources} grounded={turn.grounded} onOpenSource={onOpenSource} />
        </>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14, alignItems: "center" }}>
        <span style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase" }}>Next</span>
        <button type="button" onClick={() => onFileInstead(turn.request)} style={chipBtn}>File this as a request →</button>
        {!turn.answerError && onResearch && <button type="button" onClick={() => onResearch(turn.request)} style={chipBtn}>🔎 Research across your documents →</button>}
        {onAsk && <button type="button" onClick={onAsk} style={chipBtn}>◎ Continue in Aurora</button>}
      </div>
    </div>
  );
}

// Analyze card for an uploaded-document turn (B2) — upload progress, then a
// single-document deep read. The document is persisted + indexed, so it's also
// citable by later questions in the console.
function AnalyzeCard({ turn, onFollowUp, onFileInstead }) {
  const busy = turn.uploading || turn.analyzeLoading;
  return (
    <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, background: C.cd, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${C.br}` }}>
        <span style={{ fontSize: 15 }} aria-hidden="true">📄</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.t1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{turn.fileName}</span>
        {turn.chars ? <span style={{ fontSize: 9, fontFamily: M, color: C.t4, flexShrink: 0 }}>{turn.chars.toLocaleString()} chars</span> : null}
      </div>
      {busy ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: C.t3, fontFamily: M, fontSize: 12 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid ${C.br}`, borderTopColor: C.em, display: "inline-block", animation: "sp .7s linear infinite" }} />
          {turn.uploading ? "Reading document…" : "Analyzing…"}
        </div>
      ) : turn.error ? (
        <div style={{ color: C.t2, fontSize: 13, lineHeight: 1.6 }}>
          <div style={{ color: C.am, fontFamily: M, fontSize: 11.5, marginBottom: 8 }}>⚠ {turn.error}</div>
          I couldn&rsquo;t analyze that file. Supported: .txt, .md, .docx, .pdf (up to 3 MB).
        </div>
      ) : (
        <div style={{ fontSize: 13.5, color: C.t1, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{turn.analysis}</div>
      )}
      {!busy && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14, alignItems: "center" }}>
          <span style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase" }}>Next</span>
          {turn.analysis && onFollowUp && <button type="button" onClick={onFollowUp} style={chipBtn}>Ask a follow-up →</button>}
          {onFileInstead && <button type="button" onClick={() => onFileInstead(`Review the attached document: ${turn.fileName}`)} style={chipBtn}>File as a request →</button>}
        </div>
      )}
    </div>
  );
}

// Research card (A1) — the agent loop's step trace + grounded, cited answer.
function ResearchCard({ turn, onFollowUp, onFileInstead, onOpenSource }) {
  if (turn.researchLoading) {
    return (
      <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, background: C.cd, padding: 16, display: "flex", alignItems: "center", gap: 10, color: C.t3, fontFamily: M, fontSize: 12 }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid ${C.br}`, borderTopColor: C.em, display: "inline-block", animation: "sp .7s linear infinite" }} />
        Researching your documents…
      </div>
    );
  }
  return (
    <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, background: C.cd, padding: 16 }}>
      {turn.error ? (
        <div style={{ color: C.t2, fontSize: 13, lineHeight: 1.6 }}>
          <div style={{ color: C.am, fontFamily: M, fontSize: 11.5, marginBottom: 8 }}>⚠ {turn.error}</div>
          I couldn&rsquo;t complete the research just now.
        </div>
      ) : (
        <>
          {Array.isArray(turn.steps) && turn.steps.length > 0 && (
            <details style={{ marginBottom: 12 }}>
              <summary style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase", cursor: "pointer" }}>
                Research trace · {turn.steps.length} step{turn.steps.length === 1 ? "" : "s"}
              </summary>
              <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                {turn.steps.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 11.5, color: C.t3 }}>
                    <span style={{ fontFamily: M, color: C.tl, flexShrink: 0 }}>{i + 1}.</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontFamily: M, color: C.t2 }}>{s.action}</span>
                      {s.observation ? <span style={{ color: C.t4 }}> — {s.observation}</span> : null}
                      {s.thought ? <div style={{ color: C.t4, lineHeight: 1.4 }}>{s.thought}</div> : null}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
          <div style={{ fontSize: 13.5, color: C.t1, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{turn.answer}</div>
          <SourcesList sources={turn.sources} grounded={!turn.degraded && (turn.sources || []).length > 0} onOpenSource={onOpenSource} />
        </>
      )}
      {!turn.researchLoading && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14, alignItems: "center" }}>
          <span style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase" }}>Next</span>
          {onFollowUp && <button type="button" onClick={onFollowUp} style={chipBtn}>Ask a follow-up →</button>}
          {onFileInstead && <button type="button" onClick={() => onFileInstead(turn.request)} style={chipBtn}>File this as a request →</button>}
        </div>
      )}
    </div>
  );
}

// Artifact canvas (C1) — an editable draft (memo/email/clause/…) the user edits
// in place and can save. Saving persists + indexes the doc (citable later).
function ArtifactCard({ turn, onSave, onRegenerate, onFileInstead }) {
  const [title, setTitle] = useState(turn.title || "");
  const [content, setContent] = useState(turn.content || "");
  // Reset the editor when a fresh draft arrives (initial draft / regenerate).
  useEffect(() => { setTitle(turn.title || ""); setContent(turn.content || ""); }, [turn.draftNonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const [copied, setCopied] = useState(false);

  if (turn.draftLoading) {
    return (
      <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, background: C.cd, padding: 16, display: "flex", alignItems: "center", gap: 10, color: C.t3, fontFamily: M, fontSize: 12 }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid ${C.br}`, borderTopColor: C.em, display: "inline-block", animation: "sp .7s linear infinite" }} />
        Drafting…
      </div>
    );
  }
  if (turn.error) {
    return (
      <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, background: C.cd, padding: 16, color: C.t2, fontSize: 13, lineHeight: 1.6 }}>
        <div style={{ color: C.am, fontFamily: M, fontSize: 11.5, marginBottom: 8 }}>⚠ {turn.error}</div>
        I couldn&rsquo;t generate that draft just now.
      </div>
    );
  }
  const saved = !!turn.savedDocumentId;
  const copy = () => { try { navigator.clipboard?.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };
  return (
    <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, background: C.cd, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 14 }} aria-hidden="true">✎</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Draft title" style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: C.t1, fontFamily: SR, fontSize: 15 }} />
        <span style={{ fontSize: 9, fontFamily: M, color: C.t4, flexShrink: 0 }}>editable draft</span>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        aria-label="Draft content"
        spellCheck
        style={{ width: "100%", minHeight: 260, resize: "vertical", background: C.s1, border: `1px solid ${C.br}`, borderRadius: 8, color: C.t1, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12.5, lineHeight: 1.6, padding: "10px 12px", outline: "none", boxSizing: "border-box" }}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
        <button type="button" onClick={() => onSave(turn.id, title, content)} disabled={turn.saving || !content.trim()} style={{ ...primaryBtn, opacity: turn.saving || !content.trim() ? 0.5 : 1 }}>{turn.saving ? "Saving…" : saved ? "Save new version" : "Save to workspace"}</button>
        {saved && <span style={{ fontSize: 9.5, fontFamily: M, color: C.gn, border: `1px solid ${C.gn}`, borderRadius: 4, padding: "2px 7px", letterSpacing: 0.5, textTransform: "uppercase" }}>Saved ✓</span>}
        <button type="button" onClick={() => onRegenerate(turn.id, turn.request)} style={chipBtn}>↻ Regenerate</button>
        <button type="button" onClick={copy} style={chipBtn}>{copied ? "Copied ✓" : "Copy"}</button>
        {onFileInstead && <button type="button" onClick={() => onFileInstead(`Review this draft: ${title}`)} style={chipBtn}>File as a request →</button>}
      </div>
      {turn.degraded && <div style={{ marginTop: 8, fontSize: 10.5, fontFamily: M, color: C.t4 }}>AI drafting was offline — edited from a skeleton.</div>}
    </div>
  );
}

// Show the workspace rail only when there's room (embedded full page, wide viewport).
function useWide(min = 1080) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(`(min-width:${min}px)`);
    const on = () => setWide(mq.matches);
    on();
    if (mq.addEventListener) { mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }
    mq.addListener(on); return () => mq.removeListener(on);
  }, [min]);
  return wide;
}

function RailSection({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

// Cowork-style right rail (à la Claude): Progress / Working folder / Context /
// Skills, all derived from the live turns — no separate state.
function WorkspaceRail({ turns, onOpenTicket, onNavigate, history, onRunSkill }) {
  const last = turns[turns.length - 1] || null;
  const progress = (() => {
    if (!last) return [];
    if (last.kind === "ask") return [
      { label: "Understanding your question", state: "done" },
      { label: last.answerLoading ? "Answering" : "Answered", state: last.answerLoading ? "active" : "done" },
    ];
    if (last.kind === "compound") return last.tasks.map((tk) => ({ label: tk.title, state: tk.error ? "error" : (tk.result || tk.toolResult) ? "done" : (tk.state === "running" || tk.state === "awaiting") ? "active" : "pending" }));
    if (last.kind === "research") return [
      { label: "Planning research", state: "done" },
      { label: last.researchLoading ? "Searching + reading documents" : "Researched", state: last.researchLoading ? "active" : last.error ? "error" : "done" },
      { label: last.researchLoading ? "Synthesizing answer" : "Answered", state: last.researchLoading ? "pending" : last.error ? "error" : "done" },
    ];
    if (last.kind === "artifact") return [
      { label: last.draftLoading ? "Drafting" : "Drafted", state: last.draftLoading ? "active" : last.error ? "error" : "done" },
      { label: last.savedDocumentId ? "Saved to workspace" : last.saving ? "Saving" : "Edit + save", state: last.savedDocumentId ? "done" : last.saving ? "active" : "pending" },
    ];
    if (last.kind === "analyze") return [
      { label: "Reading document", state: last.uploading ? "active" : "done" },
      { label: last.analyzeLoading ? "Analyzing" : last.error ? "Analysis" : "Analyzed", state: last.uploading ? "pending" : last.analyzeLoading ? "active" : last.error ? "error" : "done" },
    ];
    return last.steps.map((s) => ({ label: s.label, state: s.state }));
  })();

  // Results produced across the session (single turns + compound tasks).
  const resultsOf = (t) => t.kind === "file" && t.result ? [t.result] : t.kind === "compound" ? t.tasks.filter((tk) => tk.result).map((tk) => tk.result) : [];
  const artifacts = [];
  for (const t of turns) {
    for (const r of resultsOf(t)) {
      artifacts.push({ kind: "ticket", label: r.ticketId, sub: r.classification?.category || "Intake ticket", onClick: () => onOpenTicket(r.ticketId) });
      for (const m of (r.spawned?.matters || [])) artifacts.push({ kind: "matter", label: m.title || m.number || m.id || "Matter", sub: "Matter", onClick: onNavigate ? () => onNavigate("matters") : null });
      for (const c of (r.spawned?.contracts || [])) artifacts.push({ kind: "contract", label: c.title || c.id || "Contract", sub: "Contract", onClick: onNavigate ? () => onNavigate("contracts") : null });
    }
    // B2: uploaded + analyzed documents.
    if (t.kind === "analyze" && t.documentId) {
      artifacts.push({ kind: "document", label: t.fileName || "Document", sub: t.error ? "Upload failed" : "Uploaded · analyzed", onClick: null });
    }
    // C1: saved canvas drafts.
    if (t.kind === "artifact" && t.savedDocumentId) {
      artifacts.push({ kind: "document", label: t.title || "Draft", sub: "Draft · saved", onClick: null });
    }
    // Governed tool results (OL-2): a created matter/DSAR/etc.
    if (t.kind === "compound") for (const tk of t.tasks) if (tk.toolResult) {
      const nav = tk.toolResult.navigate;
      artifacts.push({ kind: nav === "matters" ? "matter" : nav === "contracts" ? "contract" : "ticket", label: tk.toolResult.resourceLabel, sub: tk.toolResult.label, onClick: onNavigate ? () => onNavigate(nav) : null });
    }
  }

  let lastCat = null, lastRule = null;
  for (let i = turns.length - 1; i >= 0 && !lastCat; i--) {
    const rs = resultsOf(turns[i]);
    if (rs.length) { const r = rs[rs.length - 1]; lastCat = r.classification?.category || null; lastRule = r.classification?.routingRule || null; }
  }

  const dot = (state) => state === "done" ? <span style={{ color: C.gn }}>✓</span>
    : state === "active" ? <span style={{ width: 10, height: 10, borderRadius: "50%", border: `2px solid ${C.br}`, borderTopColor: C.em, display: "inline-block", animation: "sp .7s linear infinite" }} />
    : state === "error" ? <span style={{ color: C.rd }}>✕</span>
    : <span style={{ width: 8, height: 8, borderRadius: "50%", border: `1.5px solid ${C.br}`, display: "inline-block" }} />;
  const fileIcon = (k) => k === "ticket" ? "🎫" : k === "matter" ? "▣" : k === "contract" ? "▤" : k === "document" ? "📄" : "▪";

  return (
    <div style={{ width: 300, flexShrink: 0, borderLeft: `1px solid ${C.br}`, background: C.s1, overflowY: "auto", padding: "20px 18px", minHeight: 0 }}>
      <RailSection title="Progress">
        {progress.length === 0 ? <div style={{ fontSize: 12, color: C.t4 }}>No active task — file a request or ask a question.</div> :
          progress.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "4px 0" }}>
              <span style={{ width: 14, display: "inline-flex", justifyContent: "center", fontSize: 12 }} aria-hidden="true">{dot(p.state)}</span>
              <span style={{ fontSize: 12, color: p.state === "done" ? C.t3 : p.state === "error" ? C.rd : C.t1, textDecoration: p.state === "done" ? "line-through" : "none", textDecorationColor: C.t4 }}>{p.label}</span>
            </div>
          ))}
      </RailSection>

      <RailSection title="Working folder">
        {artifacts.length === 0 ? <div style={{ fontSize: 12, color: C.t4 }}>Nothing filed yet.</div> :
          artifacts.map((a, i) => (
            <button key={i} type="button" onClick={a.onClick || undefined} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 9, padding: "7px 8px", marginBottom: 4, background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, cursor: a.onClick ? "pointer" : "default" }}>
              <span aria-hidden="true" style={{ fontSize: 13 }}>{fileIcon(a.kind)}</span>
              <span style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.t1, fontFamily: M, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.label}</div>
                <div style={{ fontSize: 10, color: C.t4 }}>{a.sub}</div>
              </span>
            </button>
          ))}
      </RailSection>

      {history && history.length > 0 && (
        <RailSection title="Recent (persisted)">
          {history.slice(0, 8).map((h) => (
            <button key={h.id} type="button" onClick={h.navigate && onNavigate ? () => onNavigate(h.navigate) : undefined} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 9, padding: "6px 8px", marginBottom: 3, background: "transparent", border: `1px solid ${C.br}`, borderRadius: 8, cursor: h.navigate && onNavigate ? "pointer" : "default" }}>
              <span aria-hidden="true" style={{ fontSize: 12, color: h.status === "error" ? C.rd : C.gn }}>{h.status === "error" ? "✕" : "✓"}</span>
              <span style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, color: C.t2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.resourceLabel || h.title}</div>
                <div style={{ fontSize: 9.5, color: C.t4, fontFamily: M }}>{h.toolId || h.kind}</div>
              </span>
            </button>
          ))}
        </RailSection>
      )}

      <RailSection title="Context">
        {["Intake pipeline", lastRule ? `Routing · ${lastRule}` : "Routing rules", "Audit chain · sealed", "Matter / Contract auto-spawn"].map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12, color: C.t2 }}>
            <span style={{ color: C.tl }} aria-hidden="true">◦</span>{c}
          </div>
        ))}
      </RailSection>

      <RailSection title="Skills">
        {SKILLS.map((s) => {
          const active = lastCat && s.cats.includes(lastCat);
          return (
            <button
              key={s.id}
              type="button"
              onClick={onRunSkill ? () => onRunSkill(s) : undefined}
              title={s.desc}
              style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", marginBottom: 1, background: active ? C.emG : "transparent", border: "1px solid transparent", borderRadius: 8, cursor: onRunSkill ? "pointer" : "default", fontSize: 12, color: active ? C.t1 : C.t2, fontWeight: active ? 600 : 400, fontFamily: F }}
            >
              <span style={{ fontSize: 12, color: active ? C.em : C.tl, flexShrink: 0, width: 14, textAlign: "center" }} aria-hidden="true">{s.icon}</span>
              <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</span>
            </button>
          );
        })}
      </RailSection>
    </div>
  );
}

// CW-1 — the clarify-before-file card. Collects the missing facts for a
// request's category inline, then files a complete ticket. Gathers input only;
// filing still runs through the governed intake chokepoint.
function ClarifyCard({ turn, onFile }) {
  const [answers, setAnswers] = useState({});
  const set = (k, v) => setAnswers((a) => ({ ...a, [k]: v }));
  const missing = Array.isArray(turn.missing) ? turn.missing : [];
  const allAnswered = missing.every((f) => String(answers[f.key] || "").trim());
  const build = () => {
    const lines = missing
      .filter((f) => String(answers[f.key] || "").trim())
      .map((f) => `${f.label}: ${String(answers[f.key]).trim()}`);
    return lines.length ? `${turn.baseText}\n\n${lines.join("\n")}` : turn.baseText;
  };
  const detected = Object.values(turn.extracted || {});
  return (
    <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, background: C.cd, padding: "14px 16px" }}>
      <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
        A few details before I file{turn.category ? ` · ${turn.category}` : ""}
      </div>
      {detected.length > 0 && (
        <div style={{ fontSize: 12, color: C.t3, marginBottom: 12 }}>Detected — {detected.join(" · ")}</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {missing.map((f) => (
          <div key={f.key}>
            <div style={{ fontSize: 13, color: C.t1, marginBottom: 6 }}>{f.question}</div>
            {f.kind === "choice" && Array.isArray(f.options) ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {f.options.map((opt) => {
                  const sel = answers[f.key] === opt;
                  return (
                    <button key={opt} type="button" onClick={() => set(f.key, opt)}
                      style={{ background: sel ? C.em : "transparent", color: sel ? C.bg : C.t2, border: `1px solid ${sel ? C.em : C.br}`, borderRadius: 999, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                      {opt}
                    </button>
                  );
                })}
              </div>
            ) : (
              <input type="text" value={answers[f.key] || ""} onChange={(e) => set(f.key, e.target.value)} placeholder={f.label}
                style={{ width: "100%", background: C.bg, color: C.t1, border: `1px solid ${C.br}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }} />
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14 }}>
        <button type="button" onClick={() => onFile(build())} disabled={!allAnswered}
          style={{ ...primaryBtn, opacity: allAnswered ? 1 : 0.5, cursor: allAnswered ? "pointer" : "not-allowed" }}>
          File request ⏎
        </button>
        <button type="button" onClick={() => onFile(build())}
          style={{ background: "transparent", border: "none", color: C.t4, fontFamily: M, fontSize: 9.5, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}>
          File with what I have
        </button>
      </div>
    </div>
  );
}

export function CommandConsole({ open, embedded, initialText, onClose, onNavigate, onAsk }) {
  const [turns, setTurns] = useState([]);
  const [input, setInput] = useState("");
  const [me, setMe] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [history, setHistory] = useState([]);
  const scrollRef = useRef(null);
  const startedRef = useRef(false);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const recordedRef = useRef(new Set());

  const isOpen = embedded || open;
  const wide = useWide(1080);

  const patchTurn = useCallback((turnId, patch) => {
    setTurns((ts) => ts.map((t) => (t.id === turnId ? { ...t, ...patch } : t)));
  }, []);
  const patchStep = useCallback((turnId, key, state, detail) => {
    setTurns((ts) => ts.map((t) => t.id !== turnId ? t : { ...t, steps: t.steps.map((s) => s.key === key ? { ...s, state, ...(detail !== undefined ? { detail } : {}) } : s) }));
  }, []);

  // Insert the "dispatch" step (only present when the pipeline spawns
  // downstream work) just before the terminal "done" step.
  const ensureDispatchStep = useCallback((turnId) => {
    setTurns((ts) => ts.map((t) => {
      if (t.id !== turnId || t.steps.some((s) => s.key === "dispatch")) return t;
      const doneIdx = t.steps.findIndex((s) => s.key === "done");
      const at = doneIdx === -1 ? t.steps.length : doneIdx;
      const dispatch = { key: "dispatch", label: "Dispatching to the module", state: "pending", detail: null };
      return { ...t, steps: [...t.steps.slice(0, at), dispatch, ...t.steps.slice(at)] };
    }));
  }, []);

  // Task-scoped patchers for the compound (multi-task) execution window.
  const patchTask = useCallback((turnId, taskId, patch) => {
    setTurns((ts) => ts.map((t) => t.id !== turnId ? t : { ...t, tasks: t.tasks.map((tk) => tk.id === taskId ? { ...tk, ...patch } : tk) }));
  }, []);
  const patchTaskStep = useCallback((turnId, taskId, key, state, detail) => {
    setTurns((ts) => ts.map((t) => t.id !== turnId ? t : { ...t, tasks: t.tasks.map((tk) => tk.id !== taskId ? tk : { ...tk, steps: tk.steps.map((s) => s.key === key ? { ...s, state, ...(detail !== undefined ? { detail } : {}) } : s) }) }));
  }, []);
  const ensureTaskDispatch = useCallback((turnId, taskId) => {
    setTurns((ts) => ts.map((t) => t.id !== turnId ? t : { ...t, tasks: t.tasks.map((tk) => {
      if (tk.id !== taskId || tk.steps.some((s) => s.key === "dispatch")) return tk;
      const di = tk.steps.findIndex((s) => s.key === "done");
      const at = di === -1 ? tk.steps.length : di;
      return { ...tk, steps: [...tk.steps.slice(0, at), { key: "dispatch", label: "Dispatching to the module", state: "pending", detail: null }, ...tk.steps.slice(at)] };
    }) }));
  }, []);

  // Deterministic sync fallback — mirrors the streamed plan over the one-shot
  // route, driven into whatever "sink" the caller provides.
  const execRequestSync = useCallback(async (text, on) => {
    const p = fetch("/api/intake/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })));
    on.step("read", "active"); await wait(450); on.step("read", "done");
    on.step("classify", "active"); await wait(600);
    let res;
    try { res = await p; } catch (e) { on.step("classify", "error"); on.error(String(e.message || e)); return; }
    if (!res.ok || !res.d.ok) { on.step("classify", "error"); on.error(res.d?.error || "Request failed"); return; }
    const d = res.d;
    on.step("classify", "done", `→ ${d.classification.category}`);
    on.step("route", "active"); await wait(500); on.step("route", "done", `→ ${d.classification.team} · ${d.classification.priority}`);
    on.step("file", "active"); await wait(500); on.step("file", "done", `→ ${d.ticketId}`);
    const spawnN = (d.spawned?.matters?.length || 0) + (d.spawned?.contracts?.length || 0);
    if (spawnN > 0) { on.dispatch(); on.step("dispatch", "active"); await wait(500); on.step("dispatch", "done", `→ ${d.spawned.matters.length} matter(s), ${d.spawned.contracts.length} contract(s)`); }
    on.step("done", "active"); await wait(300); on.step("done", "done");
    on.result(d);
  }, []);

  // One request → the governed intake pipeline (SSE), driven into a sink (a
  // top-level turn, or one task of a compound turn). Falls back to sync.
  const execRequest = useCallback(async (text, on) => {
    let response;
    try {
      response = await fetch("/api/intake/request-stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    } catch { return execRequestSync(text, on); }
    const ctype = response.headers.get("content-type") || "";
    if (!response.ok || !response.body || !ctype.includes("text/event-stream")) {
      if (!response.ok) {
        let msg = "Request failed";
        try { const j = await response.json(); msg = j.error || msg; } catch { /* ignore */ }
        on.step("classify", "error"); on.error(msg); return;
      }
      return execRequestSync(text, on);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sawFrame = false;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            const f = JSON.parse(dataLine.slice(6)); sawFrame = true;
            if (f.type === "step") { if (f.key === "dispatch") on.dispatch(); on.step(f.key, f.state, f.detail); }
            else if (f.type === "result") on.result(f.result);
            else if (f.type === "error") on.error(f.error);
          } catch { /* skip malformed */ }
        }
      }
    } catch (e) {
      if (!sawFrame) return execRequestSync(text, on);
      on.error(String(e.message || e));
    }
  }, [execRequestSync]);

  const sinkTurn = useCallback((turnId) => ({
    step: (k, s, d) => patchStep(turnId, k, s, d),
    dispatch: () => ensureDispatchStep(turnId),
    result: (d) => patchTurn(turnId, { result: d }),
    error: (m) => patchTurn(turnId, { error: m }),
  }), [patchStep, ensureDispatchStep, patchTurn]);
  const sinkTask = useCallback((turnId, taskId) => ({
    step: (k, s, d) => patchTaskStep(turnId, taskId, k, s, d),
    dispatch: () => ensureTaskDispatch(turnId, taskId),
    result: (d) => patchTask(turnId, taskId, { result: d }),
    error: (m) => patchTask(turnId, taskId, { error: m }),
  }), [patchTaskStep, ensureTaskDispatch, patchTask]);

  const runFile = useCallback((turnId, text) => execRequest(text, sinkTurn(turnId)), [execRequest, sinkTurn]);

  // Compound: run each task into its own slot. Tasks with a governed tool
  // proposal WAIT for the human Approve keystroke; the rest run the intake
  // pipeline immediately.
  const runCompound = useCallback(async (turnId, tasks) => {
    // Independent (non-tool) tasks run in PARALLEL (Cowork-style sub-agents);
    // tool tasks wait for the human Approve keystroke.
    await Promise.all(tasks.map(async (task) => {
      if (task.tool) { patchTask(turnId, task.id, { state: "awaiting" }); return; }
      patchTask(turnId, task.id, { state: "running" });
      await execRequest(task.request, sinkTask(turnId, task.id));
      patchTask(turnId, task.id, { state: "done" });
    }));
  }, [execRequest, sinkTask, patchTask]);

  // Human approved a proposed tool → execute it via the governed act route,
  // which writes the AgentDecision + chain-sealed audit. `targetId` is the
  // chosen resource for tools that act on one (e.g. a legal hold's matter).
  const approveTask = useCallback(async (turnId, task, targetId) => {
    patchTask(turnId, task.id, { state: "running" });
    patchTaskStep(turnId, task.id, "read", "done");
    patchTaskStep(turnId, task.id, "classify", "done", `→ ${task.tool.label}`);
    patchTaskStep(turnId, task.id, "route", "done");
    patchTaskStep(turnId, task.id, "file", "active");
    try {
      const r = await fetch("/api/one-legal/act", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toolId: task.tool.id, text: task.request, targetId: targetId || null }) });
      const d = await r.json();
      if (!r.ok || !d.ok) { patchTaskStep(turnId, task.id, "file", "error"); patchTask(turnId, task.id, { error: d.error || "Action failed", state: "done" }); return; }
      patchTaskStep(turnId, task.id, "file", "done", `→ ${d.resourceLabel}`);
      patchTaskStep(turnId, task.id, "done", "done");
      patchTask(turnId, task.id, { toolResult: d, state: "done" });
    } catch (e) { patchTaskStep(turnId, task.id, "file", "error"); patchTask(turnId, task.id, { error: String(e.message || e), state: "done" }); }
  }, [patchTask, patchTaskStep]);

  // Human declined the tool → fall back to filing the task as an intake ticket.
  const fileTaskAsTicket = useCallback((turnId, task) => {
    patchTask(turnId, task.id, { tool: null, state: "running" });
    execRequest(task.request, sinkTask(turnId, task.id)).then(() => patchTask(turnId, task.id, { state: "done" }));
  }, [execRequest, sinkTask, patchTask]);

  // Answer a QUESTION — capability overview (built-in) or a model answer that
  // degrades gracefully. Never files a ticket.
  const runAsk = useCallback(async (turnId, text, capability) => {
    if (capability) { patchTurn(turnId, { answerLoading: false, capability: true }); return; }
    patchTurn(turnId, { answerLoading: true });
    try {
      // K1.3 — cited Q&A. The server retrieves from the org's own documents
      // (@aegis/search) and grounds the answer; it returns the sources it drew
      // on. Degrades to a general answer server-side when there's nothing to
      // cite, so behaviour is never worse than before.
      const resp = await fetch("/api/one-legal/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await resp.json().catch(() => ({}));
      if (data && data.ok && (data.answer || "").trim()) {
        patchTurn(turnId, { answer: String(data.answer).trim(), sources: Array.isArray(data.sources) ? data.sources : [], grounded: !!data.grounded, nav: Array.isArray(data.nav) ? data.nav : [], answerLoading: false });
      } else if (data && data.error) {
        patchTurn(turnId, { answerLoading: false, answerError: data.error });
      } else {
        patchTurn(turnId, { answerLoading: false, answerError: "I couldn't answer that just now." });
      }
    } catch (e) {
      patchTurn(turnId, { answerLoading: false, answerError: friendlyAIError(e) });
    }
  }, [patchTurn]);

  // Force-file text as a request (used by "File this as a request →").
  const fileRequest = useCallback((text) => {
    const t = text.trim();
    if (t.length < 3) return;
    const id = ++TURN_SEQ;
    setTurns((ts) => [...ts, { id, kind: "file", request: t, steps: baseSteps(), result: null, error: null }]);
    setInput("");
    runFile(id, t);
  }, [runFile]);

  // CW-1 — clarify-before-file. Ask /api/intake/clarify whether key facts for
  // this request's category are missing; if so, render a clarify turn to collect
  // them, then file a complete ticket. Degrade-safe: on no-missing or any error,
  // file directly (unchanged behavior). Gathers input only — the file still
  // goes through the governed intake chokepoint.
  const clarifyThenFile = useCallback(async (text) => {
    const t = text.trim();
    if (t.length < 3) return;
    let data = null;
    try {
      const r = await fetch("/api/intake/clarify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t }) });
      if (r.ok) data = await r.json();
    } catch { /* degrade → file directly */ }
    if (data && data.ok && Array.isArray(data.missing) && data.missing.length > 0) {
      const id = ++TURN_SEQ;
      setTurns((ts) => [...ts, { id, kind: "clarify", request: t, baseText: t, category: data.category, missing: data.missing, extracted: data.extracted || {} }]);
      return;
    }
    fileRequest(t);
  }, [fileRequest]);

  // B2 — upload a document, then deep-read it. The file is extracted +
  // persisted + indexed server-side; the analysis is a single-document read.
  // The uploaded doc also becomes citable by later questions in the console.
  const uploadAndAnalyze = useCallback(async (file) => {
    if (!file) return;
    const id = ++TURN_SEQ;
    setTurns((ts) => [...ts, { id, kind: "analyze", request: `Analyze ${file.name}`, fileName: file.name, uploading: true, analyzeLoading: false, analysis: null, documentId: null, chars: 0, error: null }]);
    try {
      const contentBase64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || "").split(",")[1] || "");
        r.onerror = () => reject(new Error("Could not read the file."));
        r.readAsDataURL(file);
      });
      const up = await fetch("/api/one-legal/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, contentBase64, sessionId }),
      }).then((r) => r.json()).catch(() => ({}));
      if (!up || !up.ok) { patchTurn(id, { uploading: false, error: (up && up.error) || "Upload failed." }); return; }
      patchTurn(id, { uploading: false, analyzeLoading: true, documentId: up.documentId, chars: up.charCount || 0 });
      const an = await fetch("/api/one-legal/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: up.documentId }),
      }).then((r) => r.json()).catch(() => ({}));
      if (an && an.ok) patchTurn(id, { analyzeLoading: false, analysis: (an.answer || "").trim(), degraded: !!an.degraded });
      else patchTurn(id, { analyzeLoading: false, error: (an && an.error) || "Analysis failed." });
    } catch (e) {
      patchTurn(id, { uploading: false, analyzeLoading: false, error: friendlyAIError(e) });
    }
  }, [patchTurn, sessionId]);

  // A1 — run the research agent loop (multi-step, read-only) over the org's
  // documents and render the trace + cited answer. Never mutates anything.
  const runResearch = useCallback(async (turnId, text) => {
    patchTurn(turnId, { researchLoading: true });
    try {
      const resp = await fetch("/api/one-legal/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const d = await resp.json().catch(() => ({}));
      if (d && d.ok && (d.answer || "").trim()) {
        patchTurn(turnId, { researchLoading: false, answer: String(d.answer).trim(), sources: Array.isArray(d.sources) ? d.sources : [], steps: Array.isArray(d.steps) ? d.steps : [], degraded: !!d.degraded });
      } else {
        patchTurn(turnId, { researchLoading: false, error: (d && d.error) || "Research failed." });
      }
    } catch (e) {
      patchTurn(turnId, { researchLoading: false, error: friendlyAIError(e) });
    }
  }, [patchTurn]);

  const startResearch = useCallback((text) => {
    const t = (text || "").trim();
    if (t.length < 3) return;
    const id = ++TURN_SEQ;
    setTurns((ts) => [...ts, { id, kind: "research", request: t, researchLoading: true, answer: null, sources: [], steps: [], error: null }]);
    runResearch(id, t);
  }, [runResearch]);

  // C1 — generate an editable draft into the artifact canvas. Not a formal
  // Contract (that stays the governed contracts.draft tool); this is the fast,
  // editable-draft surface.
  const runArtifactDraft = useCallback(async (turnId, instruction) => {
    patchTurn(turnId, { draftLoading: true, error: null });
    try {
      const resp = await fetch("/api/one-legal/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instruction }) });
      const d = await resp.json().catch(() => ({}));
      if (d && d.ok && (d.content || "").trim()) {
        patchTurn(turnId, { draftLoading: false, title: d.title || "Draft", content: d.content, degraded: !!d.degraded, draftNonce: Date.now() });
      } else {
        patchTurn(turnId, { draftLoading: false, error: (d && d.error) || "Draft failed." });
      }
    } catch (e) {
      patchTurn(turnId, { draftLoading: false, error: friendlyAIError(e) });
    }
  }, [patchTurn]);

  const startArtifact = useCallback((instruction) => {
    const t = (instruction || "").trim();
    if (t.length < 3) return;
    const id = ++TURN_SEQ;
    setTurns((ts) => [...ts, { id, kind: "artifact", request: t, draftLoading: true, title: "", content: "", degraded: false, error: null, saving: false, savedDocumentId: null, draftNonce: 0 }]);
    setInput("");
    runArtifactDraft(id, t);
  }, [runArtifactDraft]);

  const saveArtifact = useCallback(async (turnId, title, content) => {
    patchTurn(turnId, { saving: true });
    try {
      const resp = await fetch("/api/one-legal/artifact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, content, sessionId }) });
      const d = await resp.json().catch(() => ({}));
      if (d && d.ok && d.documentId) patchTurn(turnId, { saving: false, savedDocumentId: d.documentId, title: d.title || title });
      else patchTurn(turnId, { saving: false, error: (d && d.error) || "Save failed." });
    } catch (e) {
      patchTurn(turnId, { saving: false, error: friendlyAIError(e) });
    }
  }, [patchTurn, sessionId]);

  // Decompose a (likely-compound) request into tasks, then run them as a
  // compound execution window. Falls back to a single turn when the planner
  // returns one task (or is unavailable).
  const planAndRun = useCallback(async (text) => {
    let tasks = null;
    try {
      const r = await fetch("/api/one-legal/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const d = await r.json();
      if (r.ok && d.ok && Array.isArray(d.tasks) && d.tasks.length >= 1) tasks = d.tasks;
    } catch { /* planner unavailable → single turn */ }
    if (!tasks) { fileRequest(text); return; }
    // Compound window when there are several tasks, or any task proposes a
    // governed tool worth surfacing for approval.
    const shouldCompound = tasks.length > 1 || tasks.some((tk) => tk.tool);
    if (!shouldCompound) { fileRequest(text); return; }
    const id = ++TURN_SEQ;
    const taskObjs = tasks.slice(0, 5).map((tk, i) => ({ id: `${id}-${i}`, title: tk.title || `Task ${i + 1}`, request: tk.request || text, tool: tk.tool || null, steps: baseSteps(), result: null, toolResult: null, error: null, state: "pending" }));
    setTurns((ts) => [...ts, { id, kind: "compound", request: text, tasks: taskObjs }]);
    runCompound(id, taskObjs);
  }, [fileRequest, runCompound]);

  // Route a submission by intent: question → answer; compound request → plan
  // into tasks; single request → file.
  const startTurn = useCallback((text) => {
    const t = text.trim();
    if (t.length < 3) return;
    if (looksLikeCanvasDraft(t)) { startArtifact(t); return; }
    const intent = classifyIntent(t);
    setInput("");
    if (intent === "file") { if (looksCompound(t) || looksToolish(t)) planAndRun(t); else clarifyThenFile(t); return; }
    const id = ++TURN_SEQ;
    const capability = intent === "capability";
    setTurns((ts) => [...ts, { id, kind: "ask", request: t, answer: null, answerLoading: !capability, answerError: null, capability }]);
    runAsk(id, t, capability);
  }, [clarifyThenFile, planAndRun, runAsk, startArtifact]);

  // E1 — run a reusable skill (playbook). "prefill" drops the prompt in the
  // composer for the user to complete; the others route through the same
  // pipeline as typed input, so governance is unchanged.
  const runSkill = useCallback((skill) => {
    if (!skill) return;
    const p = skill.prompt || "";
    if (skill.action === "prefill") { setInput(p); setTimeout(() => inputRef.current?.focus(), 0); return; }
    if (skill.action === "research") { startResearch(p); return; }
    startTurn(p); // "route" — intent router (ask / file / tool / compound)
  }, [startResearch, startTurn]);

  // Auto-run a seeded request once when opened from the omnibox.
  useEffect(() => {
    if (isOpen && initialText && !startedRef.current) {
      startedRef.current = true;
      startTurn(initialText);
    }
    if (!isOpen) { startedRef.current = false; setTurns([]); setInput(""); }
  }, [isOpen, initialText, startTurn]);

  // Focus the composer when opened with no seed.
  useEffect(() => {
    if (isOpen && !initialText) {
      const id = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(id);
    }
  }, [isOpen, initialText]);

  // Best-effort: greet the signed-in user by name.
  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/auth/current-user").then((r) => r.json()).then((d) => setMe(d?.user ?? null)).catch(() => {});
  }, [isOpen]);

  // OL-4: a stable per-browser session id + rehydrate recent persisted tasks.
  useEffect(() => {
    try {
      let s = window.localStorage.getItem("aegis.onelegal.session");
      if (!s) { s = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; window.localStorage.setItem("aegis.onelegal.session", s); }
      setSessionId(s);
    } catch { setSessionId(`${Date.now()}`); }
  }, []);
  useEffect(() => {
    if (!isOpen || !sessionId) return;
    fetch(`/api/one-legal/history?sessionId=${encodeURIComponent(sessionId)}&limit=20`).then((r) => r.json()).then((d) => { if (d?.ok) setHistory(d.tasks || []); }).catch(() => {});
  }, [isOpen, sessionId]);

  // OL-4: persist each task the moment it reaches a terminal state (best-effort,
  // once per task). Keeps the durable run record + the rail's Recent section.
  useEffect(() => {
    if (!sessionId) return;
    const rec = (key, payload) => {
      if (recordedRef.current.has(key)) return;
      recordedRef.current.add(key);
      try { fetch("/api/one-legal/record", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, ...payload }) }).catch(() => {}); } catch { /* ignore */ }
    };
    for (const t of turns) {
      if (t.kind === "ask") {
        if (!t.answerLoading && (t.answer || t.answerError || t.capability)) rec(`a-${t.id}`, { title: t.request.slice(0, 80), request: t.request, kind: "ask", status: t.answerError ? "error" : "done" });
      } else if (t.kind === "research") {
        if (!t.researchLoading && (t.answer || t.error)) rec(`r-${t.id}`, { title: t.request.slice(0, 80), request: t.request, kind: "ask", status: t.error ? "error" : "done" });
      } else if (t.kind === "file") {
        if (t.result || t.error) rec(`f-${t.id}`, { title: t.result?.ticketId || t.request.slice(0, 60), request: t.request, kind: "file", status: t.error ? "error" : "done", resourceType: "IntakeTicket", resourceId: t.result?.ticketId, resourceLabel: t.result?.ticketId, navigate: "intake", error: t.error });
      } else if (t.kind === "analyze") {
        if (!t.uploading && !t.analyzeLoading && (t.analysis || t.error)) rec(`an-${t.id}`, { title: t.fileName?.slice(0, 80) || "Document", request: t.request, kind: "file", status: t.error ? "error" : "done", resourceType: "Document", resourceId: t.documentId, resourceLabel: t.fileName, error: t.error });
      } else if (t.kind === "artifact") {
        if (t.savedDocumentId) rec(`art-${t.id}`, { title: (t.title || "Draft").slice(0, 80), request: t.request, kind: "file", status: "done", resourceType: "Document", resourceId: t.savedDocumentId, resourceLabel: t.title });
      } else if (t.kind === "compound") {
        for (const tk of t.tasks) {
          if (tk.result || tk.toolResult || tk.error) rec(`c-${tk.id}`, {
            title: tk.title, request: tk.request, kind: tk.tool ? "tool" : "file", toolId: tk.tool?.id, status: tk.error ? "error" : "done",
            resourceType: tk.toolResult ? tk.toolResult.label : (tk.result ? "IntakeTicket" : undefined),
            resourceId: tk.toolResult?.resourceId || tk.result?.ticketId, resourceLabel: tk.toolResult?.resourceLabel || tk.result?.ticketId,
            navigate: tk.toolResult?.navigate || (tk.result ? "intake" : undefined), error: tk.error,
          });
        }
      }
    }
  }, [turns, sessionId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns]);

  // Esc closes only the overlay variant (the embedded page has no close).
  useEffect(() => {
    if (embedded) return;
    function onKey(e) { if (e.key === "Escape" && open && onClose) onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [embedded, open, onClose]);

  // Navigate to the filed ticket's detail (deep-link) or the cockpit, closing
  // the overlay first so the destination isn't left underneath it.
  const goIntake = useCallback((ticketId) => {
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("view", "intake");
      if (ticketId) u.searchParams.set("intakeTicket", ticketId);
      else u.searchParams.delete("intakeTicket");
      window.history.replaceState({}, "", u);
    } catch { /* URL API unavailable — navigation still fires below */ }
    if (onClose) onClose();
    if (onNavigate) onNavigate("intake");
  }, [onClose, onNavigate]);

  const focusComposer = useCallback(() => inputRef.current?.focus(), []);
  // Navigate to a module (used by tool results, e.g. "Open matter").
  const goModule = useCallback((view) => {
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("view", view);
      window.history.replaceState({}, "", u);
    } catch { /* URL API unavailable */ }
    if (onClose) onClose();
    if (onNavigate) onNavigate(view);
  }, [onClose, onNavigate]);
  const handleAsk = onAsk ? () => { if (onClose) onClose(); onAsk(); } : null;

  if (!isOpen) return null;

  const busy = turns.some((t) => t.kind === "ask" ? t.answerLoading : t.kind === "research" ? t.researchLoading : t.kind === "artifact" ? (t.draftLoading || t.saving) : t.kind === "analyze" ? (t.uploading || t.analyzeLoading) : t.kind === "compound" ? t.tasks.some((tk) => tk.state === "running") : (!t.result && !t.error));
  const firstName = (me?.name || "").trim().split(/\s+/)[0] || "";

  const composer = (big) => (
    <div style={{ display: "flex", gap: 8, alignItems: "center", background: C.cd, border: `1px solid ${C.brL}`, borderRadius: 12, padding: big ? "6px 6px 6px 16px" : "5px 5px 5px 14px", boxShadow: big ? "0 2px 14px rgba(16,24,40,.06)" : "none" }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.markdown,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) uploadAndAnalyze(f); e.target.value = ""; }}
      />
      <button type="button" onClick={() => fileInputRef.current?.click()} aria-label="Attach a document to analyze" title="Attach a document (.txt, .md, .docx, .pdf)" style={{ background: "transparent", border: "none", color: C.t3, fontSize: 16, cursor: "pointer", padding: "4px 2px", flexShrink: 0, lineHeight: 1 }}>📎</button>
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && input.trim().length >= 3) startTurn(input); }}
        placeholder={turns.length === 0 ? "Describe a request, ask a question, or attach a document…" : "Ask, file a request, or attach a document…"}
        aria-label="Ask AEGIS or file a legal request"
        style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: C.t1, fontFamily: F, fontSize: big ? 15 : 13, padding: "8px 0" }}
      />
      <button type="button" onClick={() => { if (input.trim().length >= 3) startTurn(input); }} disabled={input.trim().length < 3} style={{ ...primaryBtn, opacity: input.trim().length < 3 ? 0.5 : 1, flexShrink: 0 }}>Route ⏎</button>
    </div>
  );

  const shell = embedded
    ? { position: "relative", height: "100%", background: C.bg, display: "flex", flexDirection: "column", fontFamily: F, color: C.t1 }
    : { position: "fixed", inset: 0, zIndex: 300, background: C.bg, display: "flex", flexDirection: "column", fontFamily: F, color: C.t1 };

  return (
    <div style={shell}>
      <style>{`@keyframes ccIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@keyframes ccBar{0%{left:-40%}100%{left:100%}}`}</style>

      {/* Activity bar */}
      <div style={{ height: 2, background: "transparent", position: "relative", overflow: "hidden", flexShrink: 0 }}>
        {busy && <span style={{ position: "absolute", top: 0, width: "40%", height: "100%", background: C.em, animation: "ccBar 1.1s ease-in-out infinite" }} />}
      </div>

      {/* Header (overlay variant only — the embedded page uses the AppShell header) */}
      {!embedded && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: `1px solid ${C.br}`, flexShrink: 0 }}>
          <span style={{ fontFamily: SR, fontSize: 17 }}>AEGIS</span>
          <span style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1.5, textTransform: "uppercase" }}>One front door</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${C.br}`, color: C.t2, borderRadius: 6, padding: "5px 12px", fontFamily: M, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", cursor: "pointer" }}>← Esc</button>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {turns.length === 0 ? (
        /* ── Landing (vertically + horizontally centered, Claude-style) ── */
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 20px" }}>
          <div style={{ maxWidth: 640, width: "100%", margin: "0 auto", textAlign: "center", animation: "ccIn .3s ease" }}>
            <div style={{ fontSize: 46, marginBottom: 18, color: C.em, lineHeight: 1 }} aria-hidden="true">✳</div>
            <div style={{ fontFamily: SR, fontSize: 38, lineHeight: 1.12, color: C.t1, marginBottom: 6 }}>
              {firstName ? `${firstName} returns.` : "Welcome to ONE Legal."}
            </div>
            <div style={{ fontSize: 13.5, color: C.t3, lineHeight: 1.6, marginBottom: 22, maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
              Your one front door for legal — describe a request and I&rsquo;ll plan, file, and route it, or just ask a question.
            </div>
            {/* Pinned tip (à la Cowork's pinned note above the composer). */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left", background: C.s2, border: `1px solid ${C.br}`, borderRadius: 12, padding: "10px 14px", marginBottom: 10, maxWidth: 640, marginLeft: "auto", marginRight: "auto" }}>
              <span style={{ color: C.em, fontSize: 12 }} aria-hidden="true">✦</span>
              <span style={{ fontSize: 12.5, color: C.t3, lineHeight: 1.5, flex: 1 }}>{TIPS[new Date().getHours() % TIPS.length]}</span>
            </div>
            {composer(true)}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18, justifyContent: "center" }}>
              {EXAMPLES.map((ex) => (
                <button key={ex.text} type="button" onClick={() => startTurn(ex.text)} style={exampleChip}>
                  <span style={{ color: C.tl, marginRight: 7 }} aria-hidden="true">{ex.icon}</span>{ex.text}
                </button>
              ))}
            </div>
            {/* Skills (E1) — one-click legal-ops playbooks. */}
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Skills</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {SKILLS.map((s) => (
                  <button key={s.id} type="button" onClick={() => runSkill(s)} title={s.desc} style={exampleChip}>
                    <span style={{ color: C.em, marginRight: 7 }} aria-hidden="true">{s.icon}</span>{s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── Conversation ─────────────────────────────────────────── */
        <>
          <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 20px" }}>
            <div style={{ maxWidth: 760, margin: "0 auto", display: "grid", gap: 26 }}>
              {turns.map((t) => (
                <div key={t.id} style={{ animation: "ccIn .3s ease" }}>
                  {/* user bubble */}
                  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                    <div style={{ maxWidth: "80%", background: C.em, color: C.bg, borderRadius: "14px 14px 4px 14px", padding: "10px 14px", fontSize: 13.5, lineHeight: 1.5 }}>{t.request}</div>
                  </div>
                  {/* agent response */}
                  <div style={{ display: "flex", gap: 12 }}>
                    <span style={{ fontSize: 16, flexShrink: 0, marginTop: 2, color: C.em }} aria-hidden="true">✦</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      {t.kind === "clarify" ? (
                        <ClarifyCard turn={t} onFile={fileRequest} />
                      ) : t.kind === "ask" ? (
                        <AnswerCard turn={t} onExample={startTurn} onFileInstead={fileRequest} onAsk={handleAsk} onOpenSource={goModule} onResearch={startResearch} />
                      ) : t.kind === "research" ? (
                        <ResearchCard turn={t} onFollowUp={focusComposer} onFileInstead={fileRequest} onOpenSource={goModule} />
                      ) : t.kind === "artifact" ? (
                        <ArtifactCard turn={t} onSave={saveArtifact} onRegenerate={runArtifactDraft} onFileInstead={fileRequest} />
                      ) : t.kind === "analyze" ? (
                        <AnalyzeCard turn={t} onFollowUp={focusComposer} onFileInstead={fileRequest} />
                      ) : t.kind === "compound" ? (
                        <CompoundCard turn={t} onOpenTicket={goIntake} onOpenCockpit={() => goIntake(null)} onFollowUp={focusComposer} onApprove={(task, targetId) => approveTask(t.id, task, targetId)} onFileInstead={(task) => fileTaskAsTicket(t.id, task)} onOpenNav={goModule} />
                      ) : (
                        <>
                          <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, background: C.cd, padding: "14px 16px" }}>
                            <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Plan</div>
                            {t.steps.map((s) => <StepRow key={s.key} step={s} />)}
                          </div>
                          {t.error && <div style={{ marginTop: 10, color: C.rd, fontFamily: M, fontSize: 12, background: C.rdG, border: `1px solid ${C.rd}44`, borderRadius: 8, padding: "9px 11px" }}>⚠ {t.error}</div>}
                          {t.result && (
                            <ResultCard result={t.result} onOpenTicket={goIntake} onOpenCockpit={() => goIntake(null)} onFollowUp={focusComposer} onAsk={handleAsk} />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Composer */}
          <div style={{ borderTop: `1px solid ${C.br}`, padding: "12px 20px", flexShrink: 0 }}>
            <div style={{ maxWidth: 760, margin: "0 auto" }}>
              {composer(false)}
              {handleAsk && (
                <div style={{ textAlign: "center", marginTop: 8 }}>
                  <button type="button" onClick={handleAsk} style={{ background: "transparent", border: "none", color: C.t4, fontFamily: M, fontSize: 9.5, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}>◎ Open Aurora copilot</button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
        </div>
        {embedded && wide && <WorkspaceRail turns={turns} onOpenTicket={goIntake} onNavigate={goModule} history={history} onRunSkill={runSkill} />}
      </div>
    </div>
  );
}

const primaryBtn = { background: C.em, color: C.bg, border: "none", borderRadius: 8, padding: "9px 15px", fontFamily: M, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 700, cursor: "pointer" };
const ghostBtn = { background: "transparent", color: C.t2, border: `1px solid ${C.brL}`, borderRadius: 8, padding: "9px 15px", fontFamily: M, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 600, cursor: "pointer" };
const chipBtn = { background: "transparent", color: C.t2, border: `1px solid ${C.br}`, borderRadius: 20, padding: "5px 11px", fontFamily: F, fontSize: 11.5, cursor: "pointer" };
const exampleChip = { background: C.cd, color: C.t2, border: `1px solid ${C.br}`, borderRadius: 10, padding: "9px 13px", fontFamily: F, fontSize: 12.5, cursor: "pointer", textAlign: "left", transition: "border-color .12s" };
