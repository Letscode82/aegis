/**
 * ReviewSetConsole — keyboard-first eDiscovery reviewer console. Code each
 * review-set item for responsiveness + privilege behind the human gate (the AI
 * verdict is a suggestion), watch coding progress + AI-overturn count, then
 * freeze and produce a Bates-numbered production + privilege log. "AI proposes,
 * humans dispose."
 *
 * Shortcuts: R responsive · N not responsive · P privilege · X redact ·
 *            J/↓ next · K/↑ prev.
 */
import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { C, F, M, SR, useToast } from "@aegis/ui";

export interface ReviewSetConsoleProps {
  reviewSetId: string;
  canMutate: boolean;
  onClose: () => void;
}

interface Item {
  id: string; sourceType: string; sourceSystem: string; title: string; excerpt: string | null;
  aiVerdict: string | null; aiScore: number | null; aiRationale: string | null; aiRoute: string | null; coded: boolean;
  codedResponsive: boolean | null; codedPrivileged: boolean; redact: boolean;
}
interface Detail {
  summary: { id: string; name: string; status: string; queryString: string; custodianCount: number };
  items: Item[];
  progress: { total: number; coded: number; responsive: number; privileged: number; redacted: number };
}
interface Manifest {
  batesPrefix: string;
  produced: Array<{ bates: string; title: string; sourceSystem: string; redacted: boolean }>;
  privilegeLog: Array<{ logNo: string; title: string; sourceSystem: string; basis: string }>;
  counts: { produced: number; privileged: number; nonResponsive: number; uncoded: number };
}

const btn = (bg: string): React.CSSProperties => ({ padding: "6px 12px", background: bg, color: C.bg, border: "none", borderRadius: 5, fontFamily: M, fontSize: 10, letterSpacing: .8, fontWeight: 700, textTransform: "uppercase", cursor: "pointer" });
const ghost = (col: string): React.CSSProperties => ({ padding: "6px 12px", background: "transparent", color: col, border: `1px solid ${col}`, borderRadius: 5, fontFamily: M, fontSize: 10, letterSpacing: .8, fontWeight: 600, textTransform: "uppercase", cursor: "pointer" });
const routeColor = (route: string | null): string => route === "ATTORNEY" ? C.pp : route === "REVIEWER" ? C.bl : route === "AUTO_CULL" ? C.t4 : C.t4;
const routeLabel = (route: string | null): string => route === "ATTORNEY" ? "Attorney" : route === "REVIEWER" ? "Reviewer" : route === "AUTO_CULL" ? "Auto-cull" : "";

export const ReviewSetConsole: React.FC<ReviewSetConsoleProps> = ({ reviewSetId, canMutate, onClose }) => {
  const toast = useToast();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [cursor, setCursor] = useState(0);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [runningAi, setRunningAi] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/matter/review-sets/${reviewSetId}`).then((r) => r.json()).then((d) => { if (d.ok) setDetail(d); }).catch(() => {});
  }, [reviewSetId]);
  useEffect(() => { load(); }, [load]);

  const items = detail?.items ?? [];
  const current = items[cursor];
  const frozen = detail?.summary.status !== "OPEN";

  const code = useCallback(async (body: Record<string, unknown>, advance: boolean) => {
    if (!current || !canMutate || frozen) return;
    try {
      const r = await fetch(`/api/matter/review-sets/${reviewSetId}/items/${current.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setDetail((prev) => prev ? { ...prev, items: prev.items.map((it) => it.id === current.id ? { ...it, ...d.item } : it), progress: recompute(prev.items.map((it) => it.id === current.id ? { ...it, ...d.item } : it)) } : prev);
      if (advance) setCursor((c) => Math.min(items.length - 1, c + 1));
    } catch (e) { toast.error(String((e as Error).message || e)); }
  }, [current, canMutate, frozen, reviewSetId, items.length, toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(items.length - 1, c + 1)); }
      else if (k === "k" || e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
      else if (k === "r") { e.preventDefault(); code({ responsive: true }, true); }
      else if (k === "n") { e.preventDefault(); code({ responsive: false }, true); }
      else if (k === "p") { e.preventDefault(); code({ privileged: !current?.codedPrivileged }, false); }
      else if (k === "x") { e.preventDefault(); code({ redact: !current?.redact }, false); }
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length, code, current, onClose]);

  const runAiReview = async () => {
    setRunningAi(true);
    try {
      const r = await fetch(`/api/matter/review-sets/${reviewSetId}/ai-review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pendingOnly: false }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error);
      const rt = d.routes;
      toast.success(`AI review: ${d.scored} scored · ${rt.attorney} attorney · ${rt.reviewer} reviewer · ${rt.autoCull} auto-cull${d.degraded ? " (deterministic)" : ""}`);
      load();
    } catch (e) { toast.error(String((e as Error).message || e)); }
    finally { setRunningAi(false); }
  };
  const freeze = async () => {
    try { const r = await fetch(`/api/matter/review-sets/${reviewSetId}/freeze`, { method: "POST" }); const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error); toast.success("Review set frozen"); load(); }
    catch (e) { toast.error(String((e as Error).message || e)); }
  };
  const produce = async () => {
    try {
      const r = await fetch(`/api/matter/review-sets/${reviewSetId}/produce`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error);
      setManifest(d.manifest); toast.success(`Produced ${d.manifest.counts.produced} · ${d.manifest.counts.privileged} withheld`); load();
    } catch (e) { toast.error(String((e as Error).message || e)); }
  };
  const downloadLoadFile = () => {
    if (!manifest) return;
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `production-${reviewSetId}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const p = detail?.progress;
  const overturns = items.filter((i) => i.coded && i.aiVerdict && ((i.aiVerdict === "RELEVANT") !== (i.codedResponsive === true))).length;

  const overlay = (
    <div style={{ position: "fixed", inset: 0, background: "rgba(4,7,15,.82)", zIndex: 1200, display: "flex", flexDirection: "column", fontFamily: F }}>
      <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.br}`, display: "flex", alignItems: "center", gap: 12, background: C.bg }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontFamily: M, letterSpacing: 1.5, color: C.tl, textTransform: "uppercase" }}>Reviewer console · {detail?.summary.status}</div>
          <div style={{ fontSize: 16, fontFamily: SR, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail?.summary.name ?? "Loading…"}</div>
        </div>
        {p && <div style={{ fontSize: 11, fontFamily: M, color: C.t2 }}>{p.coded}/{p.total} coded · {p.responsive} resp · {p.privileged} priv · {overturns} AI overturns</div>}
        {canMutate && !frozen && <button onClick={runAiReview} disabled={runningAi} style={ghost(C.bl)}>{runningAi ? "Running…" : "Run AI review"}</button>}
        {canMutate && !frozen && <button onClick={freeze} style={ghost(C.am)}>Freeze</button>}
        {canMutate && detail?.summary.status === "FROZEN" && <button onClick={produce} style={btn(C.gn)}>Produce</button>}
        <div onClick={onClose} style={{ cursor: "pointer", fontSize: 11, fontFamily: M, color: C.t3 }}>✕ ESC</div>
      </div>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "300px 1fr", minHeight: 0 }}>
        {/* item list */}
        <div style={{ borderRight: `1px solid ${C.br}`, overflowY: "auto", background: C.cd }}>
          {items.map((it, i) => (
            <div key={it.id} onClick={() => setCursor(i)} style={{ padding: "8px 12px", borderBottom: `1px solid ${C.br}22`, cursor: "pointer", background: i === cursor ? C.s1 : "transparent", borderLeft: `3px solid ${it.coded ? (it.codedResponsive ? (it.codedPrivileged ? C.pp : C.gn) : C.t4) : "transparent"}` }}>
              <div style={{ fontSize: 11.5, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</div>
              <div style={{ fontSize: 9, fontFamily: M, color: C.t4, display: "flex", alignItems: "center", gap: 5 }}>
                <span>{it.sourceSystem}{it.aiVerdict ? ` · AI ${it.aiVerdict}` : ""}{it.redact ? " · redact" : ""}</span>
                {it.aiRoute && <span style={{ color: routeColor(it.aiRoute), fontWeight: 700 }}>→ {routeLabel(it.aiRoute)}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* doc viewer + coding */}
        <div style={{ overflowY: "auto", padding: "20px 24px", background: C.bg }}>
          {manifest ? (
            <div>
              <div style={{ fontSize: 15, fontFamily: SR, color: C.t1, marginBottom: 8 }}>Production manifest</div>
              <div style={{ fontSize: 12, color: C.t2, marginBottom: 12 }}>{manifest.counts.produced} produced · {manifest.counts.privileged} withheld (privilege) · {manifest.counts.nonResponsive} non-responsive</div>
              <button onClick={downloadLoadFile} style={{ ...btn(C.bl), marginBottom: 14 }}>⬇ Download load file (JSON)</button>
              <div style={{ fontSize: 9, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3, marginBottom: 4 }}>Produced (Bates)</div>
              {manifest.produced.map((x) => <div key={x.bates} style={{ fontSize: 11, fontFamily: M, color: C.t2, padding: "2px 0" }}>{x.bates} · {x.title}{x.redacted ? " (redacted)" : ""}</div>)}
              {manifest.privilegeLog.length > 0 && <>
                <div style={{ fontSize: 9, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.pp, margin: "12px 0 4px" }}>Privilege log</div>
                {manifest.privilegeLog.map((x) => <div key={x.logNo} style={{ fontSize: 11, fontFamily: M, color: C.t2, padding: "2px 0" }}>{x.logNo} · {x.title} — {x.basis}</div>)}
              </>}
              <button onClick={() => setManifest(null)} style={{ ...ghost(C.t3), marginTop: 14 }}>← Back to review</button>
            </div>
          ) : !current ? (
            <div style={{ color: C.t4, fontFamily: M, fontSize: 12 }}>{detail ? "No items in this set." : "Loading…"}</div>
          ) : (
            <div>
              <div style={{ fontSize: 9.5, fontFamily: M, color: C.t4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span>{current.sourceType} · {current.sourceSystem}{current.aiVerdict ? ` · AI: ${current.aiVerdict}${current.aiScore != null ? ` ${Math.round(current.aiScore * 100)}%` : ""}` : ""}</span>
                {current.aiRoute && <span style={{ padding: "1px 6px", borderRadius: 4, border: `1px solid ${routeColor(current.aiRoute)}`, color: routeColor(current.aiRoute), fontWeight: 700, letterSpacing: .6 }}>→ {routeLabel(current.aiRoute)}</span>}
              </div>
              <div style={{ fontSize: 17, fontFamily: SR, color: C.t1, margin: "6px 0 12px" }}>{current.title}</div>
              {current.aiRationale && <div style={{ fontSize: 10.5, fontFamily: M, color: C.t3, marginBottom: 12, lineHeight: 1.5 }}>{current.aiRationale}</div>}
              <div style={{ padding: "14px 16px", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, fontSize: 13, lineHeight: 1.7, color: C.t2, minHeight: 120 }}>{current.excerpt || <span style={{ color: C.t4, fontStyle: "italic" }}>No preview text — open in Purview for the full item.</span>}</div>

              <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
                <button disabled={!canMutate || frozen} onClick={() => code({ responsive: true }, true)} style={current.codedResponsive === true ? btn(C.gn) : ghost(C.gn)}>Responsive (R)</button>
                <button disabled={!canMutate || frozen} onClick={() => code({ responsive: false }, true)} style={current.codedResponsive === false ? btn(C.t3) : ghost(C.t3)}>Not responsive (N)</button>
                <button disabled={!canMutate || frozen} onClick={() => code({ privileged: !current.codedPrivileged }, false)} style={current.codedPrivileged ? btn(C.pp) : ghost(C.pp)}>Privileged (P)</button>
                <button disabled={!canMutate || frozen} onClick={() => code({ redact: !current.redact }, false)} style={current.redact ? btn(C.am) : ghost(C.am)}>Redact (X)</button>
                <span style={{ marginLeft: "auto", fontSize: 10, fontFamily: M, color: C.t4 }}>{cursor + 1} / {items.length} · J/K to move</span>
              </div>
              {frozen && <div style={{ fontSize: 10.5, color: C.am, fontFamily: M, marginTop: 10 }}>Set is {detail?.summary.status} — coding is locked.</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Portal to <body> so the full-screen overlay escapes any transformed /
  // positioned ancestor in the matter layout (a CSS transform on an ancestor
  // makes position:fixed resolve to that ancestor, which was collapsing the
  // console into the 320px rail). Same escape hatch the Toast uses.
  return typeof document !== "undefined" ? createPortal(overlay, document.body) : overlay;
};

function recompute(items: Item[]): Detail["progress"] {
  return {
    total: items.length,
    coded: items.filter((i) => i.coded).length,
    responsive: items.filter((i) => i.codedResponsive === true).length,
    privileged: items.filter((i) => i.codedPrivileged).length,
    redacted: items.filter((i) => i.redact).length,
  };
}
