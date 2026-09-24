import { useState, useRef, useEffect } from "react";
import { C, F, M, SR } from "@aegis/ui";

// Command bar / omnibox (WS-1) — the single front door. Type any legal
// request; it creates an intake ticket, runs the classifier + server-side
// routing, and shows where it landed with a jump into triage. Sits in the
// AppShell header, available on every screen.

const RISK_COLOR = { Low: C.gn, Medium: C.am, High: C.rd, Critical: C.rd };

export function CommandBar({ onNavigate, onAsk }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const submit = async () => {
    const t = text.trim();
    if (t.length < 3 || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/intake/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setResult(d);
      setOpen(true);
    } catch (e) {
      setError(String(e.message || e));
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setText("");
    setResult(null);
    setError(null);
    setOpen(false);
  };

  return (
    <div ref={boxRef} style={{ position: "relative", flex: 1, maxWidth: 620, margin: "0 20px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: C.bg,
          border: `1px solid ${open ? C.em : C.br}`,
          borderRadius: 8,
          padding: "6px 10px",
          transition: "border-color .12s",
        }}
      >
        <span style={{ fontSize: 12, color: C.t4 }} aria-hidden="true">⌘</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") reset();
          }}
          placeholder="New request or ask AEGIS anything…"
          aria-label="Command bar — file a legal request"
          style={{
            flex: 1,
            minWidth: 0,
            background: "transparent",
            border: "none",
            outline: "none",
            color: C.t1,
            fontFamily: F,
            fontSize: 12.5,
          }}
        />
        {text.trim().length >= 3 && (
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            style={{
              background: C.em,
              color: C.bg,
              border: "none",
              borderRadius: 5,
              padding: "4px 12px",
              fontFamily: M,
              fontSize: 9.5,
              letterSpacing: 1,
              textTransform: "uppercase",
              fontWeight: 700,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
              flexShrink: 0,
            }}
          >
            {busy ? "Routing…" : "Route ⏎"}
          </button>
        )}
      </div>

      {open && (result || error || (!busy && text.trim().length === 0)) && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: C.cd,
            border: `1px solid ${C.br}`,
            borderRadius: 8,
            boxShadow: "0 12px 32px rgba(0,0,0,.4)",
            zIndex: 200,
            padding: 14,
            fontFamily: F,
            color: C.t1,
          }}
        >
          {error && <div style={{ color: C.rd, fontFamily: M, fontSize: 12 }}>⚠ {error}</div>}

          {!result && !error && (
            <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.6 }}>
              <div style={{ fontFamily: M, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: C.t4, marginBottom: 6 }}>One front door</div>
              Describe any legal request — an NDA, a dispute, a privacy question, a vendor review — and press <kbd style={kbd}>⏎</kbd>. AEGIS files it into intake, classifies it, and routes it to the right desk.
              {onAsk && (
                <div style={{ marginTop: 10 }}>
                  <button type="button" onClick={() => { setOpen(false); onAsk(); }} style={linkBtn}>◎ Just ask Aurora instead →</button>
                </div>
              )}
            </div>
          )}

          {result && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontFamily: SR }}>Filed {result.ticketId}</span>
                <span style={{ fontSize: 9, fontFamily: M, color: C.gn, border: `1px solid ${C.gn}`, borderRadius: 4, padding: "1px 7px", letterSpacing: 0.5, textTransform: "uppercase" }}>Routed</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8, marginBottom: 12 }}>
                <Field label="Category" value={result.classification.category} />
                <Field label="Routed to" value={result.classification.team} />
                <Field label="Priority" value={result.classification.priority} />
                <Field label="SLA" value={result.classification.sla} />
                <Field label="Risk" value={result.classification.risk} color={RISK_COLOR[result.classification.risk]} />
                <Field label="Confidence" value={`${result.classification.confidence}%${result.classification.matched ? "" : " · default"}`} />
              </div>
              {((result.spawned && result.spawned.matters.length > 0) || (result.spawned && result.spawned.contracts.length > 0)) && (
                <div style={{ fontSize: 10.5, color: C.tl, fontFamily: M, marginBottom: 10 }}>
                  ✦ Auto-spawned {result.spawned.matters.length} matter(s), {result.spawned.contracts.length} contract(s)
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => { setOpen(false); if (onNavigate) onNavigate("intake"); }} style={primaryBtn}>Open in Triage →</button>
                <button type="button" onClick={reset} style={linkBtn}>File another</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 8.5, fontFamily: M, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 12, color: color || C.t1, marginTop: 2 }}>{value}</div>
    </div>
  );
}

const kbd = { background: C.s1, border: `1px solid ${C.br}`, borderRadius: 3, padding: "0 5px", fontSize: 9, fontFamily: "monospace", color: C.t2 };
const primaryBtn = { background: C.em, color: C.bg, border: "none", borderRadius: 5, padding: "7px 14px", fontFamily: M, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 700, cursor: "pointer" };
const linkBtn = { background: "transparent", color: C.t3, border: "none", padding: "7px 4px", fontFamily: M, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" };
