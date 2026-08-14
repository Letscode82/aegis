import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Contract execution guide (CTR-17) ────────────────────────────────
//
// A live "how do I get this signed" checklist at the top of the workspace.
// Reads GET /api/contracts/[id]/guide — each step is done / current / todo with
// the concrete next action. Collapsible; auto-refreshes with the workspace.

const MARK = {
  done:    { glyph: "✓", c: C.gn },
  current: { glyph: "▸", c: C.cy },
  todo:    { glyph: "○", c: C.t4 },
  skipped: { glyph: "–", c: C.t4 },
};

export function ContractGuidePanel({ contractId, refreshKey }) {
  const [guide, setGuide] = useState(null);
  const [open, setOpen] = useState(true);

  const load = useCallback(() => {
    fetch(`/api/contracts/${contractId}/guide`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && d.ok && setGuide(d.guide))
      .catch(() => {});
  }, [contractId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  if (!guide) return null;

  return (
    <div style={{ margin: "0 0 4px", border: `1px solid ${C.br}`, borderLeft: `3px solid ${guide.terminated ? C.t4 : guide.percentComplete === 100 ? C.gn : C.cy}`, borderRadius: 8, background: C.cd, overflow: "hidden" }}>
      <div onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer", background: C.s1 }}>
        <span style={{ fontSize: 13 }}>🧭</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600 }}>Steps to execute · {guide.percentComplete}%</div>
          <div style={{ fontSize: 12, fontFamily: F, color: C.t1, marginTop: 2 }}>{guide.nextAction || (guide.percentComplete === 100 ? "Active — nothing left to do." : guide.terminated ? "Contract is terminated." : "In progress.")}</div>
        </div>
        {/* progress bar */}
        <div style={{ width: 90, height: 6, background: C.br, borderRadius: 3, overflow: "hidden", flexShrink: 0 }}>
          <div style={{ width: `${guide.percentComplete}%`, height: "100%", background: guide.percentComplete === 100 ? C.gn : C.cy }} />
        </div>
        <span style={{ fontSize: 10, fontFamily: M, color: C.cy }}>{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div style={{ padding: "10px 14px" }}>
          {guide.steps.map((s, i) => {
            const m = MARK[s.state] || MARK.todo;
            return (
              <div key={s.key} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: i < guide.steps.length - 1 ? `1px solid ${C.br}22` : "none", opacity: s.state === "todo" || s.state === "skipped" ? .7 : 1 }}>
                <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontFamily: M, fontWeight: 700, color: s.state === "done" || s.state === "current" ? C.bg : m.c, background: s.state === "done" || s.state === "current" ? m.c : "transparent", border: `1px solid ${m.c}` }}>{s.state === "done" ? "✓" : i + 1}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontFamily: F, color: s.state === "current" ? C.t1 : C.t2, fontWeight: s.state === "current" ? 600 : 400 }}>{s.label} {s.state === "current" && <span style={{ fontSize: 8.5, fontFamily: M, color: C.cy, letterSpacing: .5, textTransform: "uppercase", marginLeft: 4 }}>· you are here</span>}</div>
                  <div style={{ fontSize: 10.5, fontFamily: F, color: C.t3, marginTop: 2, lineHeight: 1.45 }}>{s.detail}</div>
                  {s.action && <div style={{ fontSize: 10.5, fontFamily: M, color: C.cy, marginTop: 3, lineHeight: 1.4 }}>→ {s.action}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
