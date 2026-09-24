import { useState } from "react";
import { C, F, M } from "@aegis/ui";
import { CommandConsole } from "./CommandConsole.jsx";

// Command bar / omnibox (WS-1) — the single front door in the AppShell
// header. It is a TRIGGER: clicking or focusing it opens the full-screen
// agentic Command Console (its own page), where the request is planned into
// steps that tick off and end in the routed result. The header field never
// hosts typing itself — that happens in the console's composer — so the
// "one front door" always lands you on the same complete screen, à la
// Harvey / Legora / Claude.

export function CommandBar({ onNavigate, onAsk }) {
  const [consoleOpen, setConsoleOpen] = useState(false);

  const openConsole = () => setConsoleOpen(true);

  return (
    <div style={{ position: "relative", flex: 1, maxWidth: 620, margin: "0 20px" }}>
      <button
        type="button"
        onClick={openConsole}
        onFocus={openConsole}
        aria-label="Open the AEGIS command console — file a legal request or ask anything"
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          background: C.bg, border: `1px solid ${C.br}`, borderRadius: 8, padding: "7px 11px",
          cursor: "text", textAlign: "left", transition: "border-color .12s, box-shadow .12s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.em; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.br; }}
      >
        <span style={{ fontSize: 12, color: C.t4 }} aria-hidden="true">⌘</span>
        <span style={{ flex: 1, minWidth: 0, color: C.t4, fontFamily: F, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          New request or ask AEGIS anything…
        </span>
        <span style={{ background: C.em, color: C.bg, borderRadius: 5, padding: "3px 10px", fontFamily: M, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, flexShrink: 0 }}>Open ⏎</span>
      </button>

      <CommandConsole open={consoleOpen} initialText="" onClose={() => setConsoleOpen(false)} onNavigate={onNavigate} onAsk={onAsk} />
    </div>
  );
}
