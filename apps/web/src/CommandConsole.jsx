import { useState, useEffect, useRef, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// Command Console (WS-1, agentic) — the full-screen front door. A request
// becomes a chat turn: the user's ask, then an agent PLAN whose steps light
// up and tick off one-by-one (Gen-AI feel, à la Harvey / Legora / Claude),
// ending in the routed result. Each turn streams the real
// /api/intake/request-stream pipeline over SSE: every step lights up the
// moment its server-side work actually completes (classify, route, file,
// dispatch), rather than on a client-side timer. If streaming is
// unavailable it falls back to the synchronous /api/intake/request route.
// You can keep filing requests in the same conversation.

const wait = (ms) => new Promise((res) => setTimeout(res, ms));
let TURN_SEQ = 0;

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

function ResultCard({ result, onNavigate }) {
  const c = result.classification;
  const spawnN = (result.spawned?.matters?.length || 0) + (result.spawned?.contracts?.length || 0);
  const Field = ({ l, v, col }) => (
    <div><div style={{ fontSize: 8.5, fontFamily: M, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: 12.5, color: col || C.t1, marginTop: 2 }}>{v}</div></div>
  );
  return (
    <div style={{ marginTop: 10, border: `1px solid ${C.br}`, borderRadius: 10, background: C.cd, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontFamily: SR }}>Filed {result.ticketId}</span>
        <span style={{ fontSize: 9, fontFamily: M, color: C.gn, border: `1px solid ${C.gn}`, borderRadius: 4, padding: "1px 7px", letterSpacing: 0.5, textTransform: "uppercase" }}>Routed</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 12 }}>
        <Field l="Category" v={c.category} />
        <Field l="Routed to" v={c.team} />
        <Field l="Priority" v={c.priority} />
        <Field l="SLA" v={c.sla} />
      </div>
      {spawnN > 0 && <div style={{ fontSize: 11, color: C.tl, fontFamily: M, marginBottom: 10 }}>✦ Auto-spawned {result.spawned.matters.length} matter(s), {result.spawned.contracts.length} contract(s)</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={() => onNavigate && onNavigate("intake")} style={primaryBtn}>Open in Triage →</button>
      </div>
    </div>
  );
}

export function CommandConsole({ open, initialText, onClose, onNavigate, onAsk }) {
  const [turns, setTurns] = useState([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);
  const startedRef = useRef(false);

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

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns]);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape" && open) onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: C.bg, display: "flex", flexDirection: "column", fontFamily: F, color: C.t1 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: `1px solid ${C.br}`, flexShrink: 0 }}>
        <span style={{ fontFamily: SR, fontSize: 17 }}>AEGIS</span>
        <span style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1.5, textTransform: "uppercase" }}>One front door</span>
        <button type="button" onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${C.br}`, color: C.t2, borderRadius: 6, padding: "5px 12px", fontFamily: M, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", cursor: "pointer" }}>← Esc</button>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 20px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "grid", gap: 24 }}>
          {turns.length === 0 && (
            <div style={{ textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12.5, paddingTop: 40 }}>
              Describe any legal request — AEGIS plans it, files it, and routes it.
            </div>
          )}
          {turns.map((t) => (
            <div key={t.id}>
              {/* user bubble */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                <div style={{ maxWidth: "80%", background: C.tl, color: C.bg, borderRadius: "12px 12px 3px 12px", padding: "9px 13px", fontSize: 13, lineHeight: 1.5 }}>{t.request}</div>
              </div>
              {/* agent plan */}
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ fontSize: 15, flexShrink: 0, marginTop: 2 }} aria-hidden="true">✦</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ border: `1px solid ${C.br}`, borderRadius: 10, background: C.cd, padding: "12px 14px" }}>
                    <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Plan</div>
                    {t.steps.map((s) => <StepRow key={s.key} step={s} />)}
                  </div>
                  {t.error && <div style={{ marginTop: 8, color: C.rd, fontFamily: M, fontSize: 12 }}>⚠ {t.error}</div>}
                  {t.result && <ResultCard result={t.result} onNavigate={onNavigate} />}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Composer */}
      <div style={{ borderTop: `1px solid ${C.br}`, padding: "12px 20px", flexShrink: 0 }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && input.trim().length >= 3) { startTurn(input); setInput(""); } }}
            placeholder="File another request…"
            aria-label="File another request"
            style={{ flex: 1, minWidth: 0, background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, color: C.t1, fontFamily: F, fontSize: 12.5, padding: "10px 12px", outline: "none" }}
          />
          <button type="button" onClick={() => { if (input.trim().length >= 3) { startTurn(input); setInput(""); } }} style={{ ...primaryBtn, flexShrink: 0 }}>Route ⏎</button>
          {onAsk && <button type="button" onClick={() => { onClose(); onAsk(); }} style={{ background: "transparent", border: "none", color: C.t3, fontFamily: M, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer", flexShrink: 0 }}>◎ Ask Aurora</button>}
        </div>
      </div>
    </div>
  );
}

const primaryBtn = { background: C.em, color: C.bg, border: "none", borderRadius: 6, padding: "9px 15px", fontFamily: M, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 700, cursor: "pointer" };
