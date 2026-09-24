import { useState, useRef, useEffect } from "react";
import { C, F, M } from "@aegis/ui";
import { CommandConsole } from "./CommandConsole.jsx";

// Command bar / omnibox (WS-1) — the single front door in the AppShell
// header. Submitting opens the full-screen agentic Command Console, where the
// request is planned into steps that tick off and end in the routed result.

export function CommandBar({ onNavigate, onAsk }) {
  const [text, setText] = useState("");
  const [hint, setHint] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [seed, setSeed] = useState("");
  const boxRef = useRef(null);

  useEffect(() => {
    function onDoc(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setHint(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const submit = () => {
    const t = text.trim();
    if (t.length < 3) return;
    setSeed(t);
    setConsoleOpen(true);
    setText("");
    setHint(false);
  };

  return (
    <div ref={boxRef} style={{ position: "relative", flex: 1, maxWidth: 620, margin: "0 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.bg, border: `1px solid ${hint ? C.em : C.br}`, borderRadius: 8, padding: "6px 10px", transition: "border-color .12s" }}>
        <span style={{ fontSize: 12, color: C.t4 }} aria-hidden="true">⌘</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setHint(true)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setText(""); setHint(false); } }}
          placeholder="New request or ask AEGIS anything…"
          aria-label="Command bar — file a legal request"
          style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: C.t1, fontFamily: F, fontSize: 12.5 }}
        />
        {text.trim().length >= 3 && (
          <button type="button" onClick={submit} style={{ background: C.em, color: C.bg, border: "none", borderRadius: 5, padding: "4px 12px", fontFamily: M, fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Route ⏎</button>
        )}
      </div>

      {hint && text.trim().length === 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, boxShadow: "0 12px 32px rgba(0,0,0,.25)", zIndex: 200, padding: 14, fontFamily: F, color: C.t1 }}>
          <div style={{ fontFamily: M, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: C.t4, marginBottom: 6 }}>One front door</div>
          <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.6 }}>
            Describe any legal request — an NDA, a dispute, a privacy question, a vendor review — and press <kbd style={kbd}>⏎</kbd>. AEGIS plans it into steps, files it into intake, and routes it to the right desk.
          </div>
          {onAsk && (
            <div style={{ marginTop: 10 }}>
              <button type="button" onClick={() => { setHint(false); onAsk(); }} style={linkBtn}>◎ Just ask Aurora instead →</button>
            </div>
          )}
        </div>
      )}

      <CommandConsole open={consoleOpen} initialText={seed} onClose={() => setConsoleOpen(false)} onNavigate={onNavigate} onAsk={onAsk} />
    </div>
  );
}

const kbd = { background: C.s1, border: `1px solid ${C.br}`, borderRadius: 3, padding: "0 5px", fontSize: 9, fontFamily: "monospace", color: C.t2 };
const linkBtn = { background: "transparent", color: C.t3, border: "none", padding: "7px 4px", fontFamily: M, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" };
