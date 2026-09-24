import { useState, useEffect, useRef, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// Command Console (WS-1, agentic) — the full-screen front door, built to feel
// like a first-class AI workspace (Harvey / Legora / Claude): a welcoming
// landing with example prompts, a roomy centered conversation, and each
// request planned into steps that light up and tick off as the REAL
// /api/intake/request-stream pipeline executes server-side (SSE; classify →
// route → file → dispatch). The routed result card deep-links straight to the
// filed ticket. Falls back to the synchronous route if streaming is blocked.

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
];

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

export function CommandConsole({ open, initialText, onClose, onNavigate, onAsk }) {
  const [turns, setTurns] = useState([]);
  const [input, setInput] = useState("");
  const [me, setMe] = useState(null);
  const scrollRef = useRef(null);
  const startedRef = useRef(false);
  const inputRef = useRef(null);

  const patchStep = useCallback((turnId, key, state, detail) => {
    setTurns((ts) => ts.map((t) => t.id !== turnId ? t : { ...t, steps: t.steps.map((s) => s.key === key ? { ...s, state, ...(detail !== undefined ? { detail } : {}) } : s) }));
  }, []);
  const patchTurn = useCallback((turnId, patch) => {
    setTurns((ts) => ts.map((t) => (t.id === turnId ? { ...t, ...patch } : t)));
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

  const applyFrame = useCallback((turnId, frame) => {
    if (frame.type === "step") {
      if (frame.key === "dispatch") ensureDispatchStep(turnId);
      patchStep(turnId, frame.key, frame.state, frame.detail);
    } else if (frame.type === "result") {
      patchTurn(turnId, { result: frame.result });
    } else if (frame.type === "error") {
      patchTurn(turnId, { error: frame.error });
    }
  }, [patchStep, patchTurn, ensureDispatchStep]);

  // Synchronous fallback — mirrors the streamed plan over the one-shot route
  // when SSE is unavailable (older proxy, blocked stream, non-2xx).
  const runSync = useCallback(async (turnId, text) => {
    const p = fetch("/api/intake/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })));
    await patchStep(turnId, "read", "active"); await wait(450); await patchStep(turnId, "read", "done");
    await patchStep(turnId, "classify", "active"); await wait(600);
    let res;
    try { res = await p; } catch (e) { patchStep(turnId, "classify", "error"); patchTurn(turnId, { error: String(e.message || e) }); return; }
    if (!res.ok || !res.d.ok) { patchStep(turnId, "classify", "error"); patchTurn(turnId, { error: res.d?.error || "Request failed" }); return; }
    const d = res.d;
    await patchStep(turnId, "classify", "done", `→ ${d.classification.category}`);
    await patchStep(turnId, "route", "active"); await wait(500); await patchStep(turnId, "route", "done", `→ ${d.classification.team} · ${d.classification.priority}`);
    await patchStep(turnId, "file", "active"); await wait(500); await patchStep(turnId, "file", "done", `→ ${d.ticketId}`);
    const spawnN = (d.spawned?.matters?.length || 0) + (d.spawned?.contracts?.length || 0);
    if (spawnN > 0) {
      ensureDispatchStep(turnId);
      await patchStep(turnId, "dispatch", "active"); await wait(500);
      await patchStep(turnId, "dispatch", "done", `→ ${d.spawned.matters.length} matter(s), ${d.spawned.contracts.length} contract(s)`);
    }
    await patchStep(turnId, "done", "active"); await wait(300); await patchStep(turnId, "done", "done");
    patchTurn(turnId, { result: d });
  }, [patchStep, patchTurn, ensureDispatchStep]);

  // Stream the real pipeline over SSE — each step lights up when its
  // server-side work actually completes. Parses `data:` frames off the
  // fetch body reader (POST body isn't supported by EventSource).
  const run = useCallback(async (turnId, text) => {
    let response;
    try {
      response = await fetch("/api/intake/request-stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    } catch {
      return runSync(turnId, text);
    }
    const ctype = response.headers.get("content-type") || "";
    if (!response.ok || !response.body || !ctype.includes("text/event-stream")) {
      // Non-stream response (e.g. 401/403 JSON or a proxy that buffered it).
      if (!response.ok) {
        let msg = "Request failed";
        try { const j = await response.json(); msg = j.error || msg; } catch { /* ignore */ }
        patchStep(turnId, "classify", "error"); patchTurn(turnId, { error: msg });
        return;
      }
      return runSync(turnId, text);
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
            applyFrame(turnId, JSON.parse(dataLine.slice(6)));
            sawFrame = true;
          } catch { /* skip malformed frame */ }
        }
      }
    } catch (e) {
      if (!sawFrame) return runSync(turnId, text);
      patchTurn(turnId, { error: String(e.message || e) });
    }
  }, [runSync, applyFrame, patchStep, patchTurn]);

  const startTurn = useCallback((text) => {
    const t = text.trim();
    if (t.length < 3) return;
    const id = ++TURN_SEQ;
    setTurns((ts) => [...ts, { id, request: t, steps: baseSteps(), result: null, error: null }]);
    setInput("");
    run(id, t);
  }, [run]);

  // Auto-run the seeded request once when the console opens.
  useEffect(() => {
    if (open && initialText && !startedRef.current) {
      startedRef.current = true;
      startTurn(initialText);
    }
    if (!open) { startedRef.current = false; setTurns([]); setInput(""); }
  }, [open, initialText, startTurn]);

  // Focus the composer when the console opens as its own page.
  useEffect(() => {
    if (open && !initialText) {
      const id = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(id);
    }
  }, [open, initialText]);

  // Best-effort: greet the signed-in user by name.
  useEffect(() => {
    if (!open) return;
    fetch("/api/auth/current-user").then((r) => r.json()).then((d) => setMe(d?.user ?? null)).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns]);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape" && open) onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Navigate the app to the filed ticket's detail (deep-link) or the cockpit,
  // closing the console first so the destination isn't left under the overlay.
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

  if (!open) return null;

  const busy = turns.some((t) => !t.result && !t.error);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = (me?.name || "").trim().split(/\s+/)[0] || "";

  const composer = (big) => (
    <div style={{ display: "flex", gap: 8, alignItems: "center", background: C.cd, border: `1px solid ${C.brL}`, borderRadius: 12, padding: big ? "6px 6px 6px 16px" : "5px 5px 5px 14px", boxShadow: big ? "0 2px 14px rgba(16,24,40,.06)" : "none" }}>
      <span style={{ fontSize: 13, color: C.t4 }} aria-hidden="true">⌘</span>
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && input.trim().length >= 3) startTurn(input); }}
        placeholder={turns.length === 0 ? "Describe any legal request — an NDA, a dispute, a vendor review…" : "File another request…"}
        aria-label="File a legal request"
        style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: C.t1, fontFamily: F, fontSize: big ? 15 : 13, padding: "8px 0" }}
      />
      <button type="button" onClick={() => { if (input.trim().length >= 3) startTurn(input); }} disabled={input.trim().length < 3} style={{ ...primaryBtn, opacity: input.trim().length < 3 ? 0.5 : 1, flexShrink: 0 }}>Route ⏎</button>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: C.bg, display: "flex", flexDirection: "column", fontFamily: F, color: C.t1 }}>
      <style>{`@keyframes ccIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@keyframes ccBar{0%{left:-40%}100%{left:100%}}`}</style>

      {/* Activity bar */}
      <div style={{ height: 2, background: "transparent", position: "relative", overflow: "hidden", flexShrink: 0 }}>
        {busy && <span style={{ position: "absolute", top: 0, width: "40%", height: "100%", background: C.em, animation: "ccBar 1.1s ease-in-out infinite" }} />}
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: `1px solid ${C.br}`, flexShrink: 0 }}>
        <span style={{ fontFamily: SR, fontSize: 17 }}>AEGIS</span>
        <span style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1.5, textTransform: "uppercase" }}>One front door</span>
        <button type="button" onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${C.br}`, color: C.t2, borderRadius: 6, padding: "5px 12px", fontFamily: M, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", cursor: "pointer" }}>← Esc</button>
      </div>

      {turns.length === 0 ? (
        /* ── Landing ──────────────────────────────────────────────── */
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", justifyContent: "center", padding: "24px 20px" }}>
          <div style={{ maxWidth: 680, margin: "0 auto", width: "100%", animation: "ccIn .3s ease" }}>
            <div style={{ fontSize: 30, marginBottom: 14 }} aria-hidden="true">✦</div>
            <div style={{ fontFamily: SR, fontSize: 32, lineHeight: 1.15, color: C.t1 }}>
              {greeting}{firstName ? `, ${firstName}` : ""}.
            </div>
            <div style={{ fontFamily: SR, fontSize: 32, lineHeight: 1.15, color: C.t3, marginBottom: 16 }}>What do you need handled?</div>
            <div style={{ fontSize: 13.5, color: C.t3, lineHeight: 1.6, marginBottom: 22, maxWidth: 560 }}>
              Describe any legal request in plain language. AEGIS plans it into steps, files it into intake, routes it to the right desk, and spins up the matter or contract it needs — all on one screen.
            </div>
            {composer(true)}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
              {EXAMPLES.map((ex) => (
                <button key={ex.text} type="button" onClick={() => startTurn(ex.text)} style={exampleChip}>
                  <span style={{ color: C.tl, marginRight: 7 }} aria-hidden="true">{ex.icon}</span>{ex.text}
                </button>
              ))}
            </div>
            {onAsk && (
              <div style={{ marginTop: 20 }}>
                <button type="button" onClick={() => { onClose(); onAsk(); }} style={{ background: "transparent", color: C.t3, border: "none", padding: "6px 2px", fontFamily: M, fontSize: 10.5, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}>◎ Or just ask Aurora a question →</button>
              </div>
            )}
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
                  {/* agent plan */}
                  <div style={{ display: "flex", gap: 12 }}>
                    <span style={{ fontSize: 16, flexShrink: 0, marginTop: 2, color: C.em }} aria-hidden="true">✦</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, background: C.cd, padding: "14px 16px" }}>
                        <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Plan</div>
                        {t.steps.map((s) => <StepRow key={s.key} step={s} />)}
                      </div>
                      {t.error && <div style={{ marginTop: 10, color: C.rd, fontFamily: M, fontSize: 12, background: C.rdG, border: `1px solid ${C.rd}44`, borderRadius: 8, padding: "9px 11px" }}>⚠ {t.error}</div>}
                      {t.result && (
                        <ResultCard
                          result={t.result}
                          onOpenTicket={goIntake}
                          onOpenCockpit={() => goIntake(null)}
                          onFollowUp={focusComposer}
                          onAsk={onAsk ? () => { onClose(); onAsk(); } : null}
                        />
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
              {onAsk && (
                <div style={{ textAlign: "center", marginTop: 8 }}>
                  <button type="button" onClick={() => { onClose(); onAsk(); }} style={{ background: "transparent", border: "none", color: C.t4, fontFamily: M, fontSize: 9.5, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}>◎ Ask Aurora instead</button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const primaryBtn = { background: C.em, color: C.bg, border: "none", borderRadius: 8, padding: "9px 15px", fontFamily: M, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 700, cursor: "pointer" };
const ghostBtn = { background: "transparent", color: C.t2, border: `1px solid ${C.brL}`, borderRadius: 8, padding: "9px 15px", fontFamily: M, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 600, cursor: "pointer" };
const chipBtn = { background: "transparent", color: C.t2, border: `1px solid ${C.br}`, borderRadius: 20, padding: "5px 11px", fontFamily: F, fontSize: 11.5, cursor: "pointer" };
const exampleChip = { background: C.cd, color: C.t2, border: `1px solid ${C.br}`, borderRadius: 10, padding: "9px 13px", fontFamily: F, fontSize: 12.5, cursor: "pointer", textAlign: "left", transition: "border-color .12s" };
