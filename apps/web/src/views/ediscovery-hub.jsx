/**
 * eDiscovery hub — the cross-source Collect & Review dashboard. Every
 * collection across the platform (legal hold, DSAR, and later investigations /
 * ad-hoc culling) in one place, with source, lifecycle stage, and review
 * progress. Opening a collection deep-links to its source workspace (RC-2 adds
 * a unified /review/collections/[id] stage workspace).
 */
import { useState, useEffect, useMemo } from "react";
import { C, F, M, SR } from "@aegis/ui";

const SOURCE = {
  LEGAL_HOLD: { label: "Legal Hold", col: C.bl },
  DSAR: { label: "DSAR", col: C.tl },
  INVESTIGATION: { label: "Investigation", col: C.pp },
  ADHOC: { label: "Ad-hoc", col: C.am },
};
const STAGE = {
  INTAKE: { label: "Intake", col: C.t4 },
  REVIEW: { label: "Review", col: C.bl },
  READY: { label: "Ready", col: C.cy },
  FROZEN: { label: "Frozen", col: C.am },
  PRODUCED: { label: "Produced", col: C.gn },
};

// Every collection opens in the unified stage workspace, whatever its source.
function openHref(c) { return `/review/collections/${c.id}`; }

const badge = (col) => ({ fontSize: 10, fontWeight: 700, letterSpacing: .4, color: col, border: `1px solid ${col}`, borderRadius: 5, padding: "2px 8px", whiteSpace: "nowrap" });

export function EDiscoveryHub() {
  const [rows, setRows] = useState(null);
  const [source, setSource] = useState("ALL");
  const [stage, setStage] = useState("ALL");
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    fetch("/api/review/collections").then((r) => r.json()).then((d) => setRows(d.ok ? d.collections : [])).catch(() => setRows([]));
  }, []);

  const filtered = useMemo(() => (rows || []).filter((c) => (source === "ALL" || c.origin === source) && (stage === "ALL" || c.stage === stage)), [rows, source, stage]);
  const counts = useMemo(() => {
    const by = { total: (rows || []).length };
    for (const c of rows || []) by[c.origin] = (by[c.origin] || 0) + 1;
    return by;
  }, [rows]);

  const chip = (active, label, n, col, onClick) => (
    <button onClick={onClick} style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 20, cursor: "pointer", background: active ? (col ? `${col}22` : C.s1) : "transparent", color: col || C.t1, border: `1px solid ${active ? (col || C.brL) : C.br}`, display: "flex", alignItems: "center", gap: 6 }}>
      {col && <span style={{ width: 7, height: 7, borderRadius: "50%", background: col }} />}{label}{n != null ? ` ${n}` : ""}
    </button>
  );

  return (
    <div style={{ padding: "26px 32px", fontFamily: F, color: C.t1, maxWidth: 1440, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ marginBottom: 6, fontFamily: M, fontSize: 10.5, letterSpacing: 1.4, color: C.cy, textTransform: "uppercase" }}>eDiscovery · one review engine across the platform</div>
          <div style={{ fontFamily: SR, fontSize: 28, fontWeight: 600, marginBottom: 4 }}>Collect &amp; Review</div>
          <div style={{ fontSize: 13.5, color: C.t3, marginBottom: 20 }}>Every collection — from legal holds, DSARs, and investigations — flows through one pipeline: Collect → Cull → Review → Produce.</div>
        </div>
        <button onClick={() => setShowNew(true)} style={{ flex: "none", padding: "10px 16px", background: C.bl, color: C.bg, border: "none", borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ New collection</button>
      </div>
      {showNew && <NewCollectionModal onClose={() => setShowNew(false)} />}

      {/* filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {chip(source === "ALL", "All sources", counts.total, null, () => setSource("ALL"))}
        {Object.entries(SOURCE).map(([k, v]) => chip(source === k, v.label, counts[k], v.col, () => setSource(k)))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {chip(stage === "ALL", "All stages", null, null, () => setStage("ALL"))}
        {Object.entries(STAGE).map(([k, v]) => chip(stage === k, v.label, null, v.col, () => setStage(k)))}
      </div>

      {/* table */}
      <div style={{ border: `1px solid ${C.br}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 110px 150px 120px", gap: 0, padding: "10px 18px", background: C.cd, borderBottom: `1px solid ${C.br}`, fontSize: 10.5, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3 }}>
          <div>Collection</div><div>Source</div><div>Stage</div><div>Progress</div><div style={{ textAlign: "right" }}>Documents</div>
        </div>
        {rows === null && <div style={{ padding: 22, color: C.t4, fontFamily: M, fontSize: 12.5 }}>Loading…</div>}
        {rows !== null && filtered.length === 0 && <div style={{ padding: 22, color: C.t4, fontFamily: M, fontSize: 12.5 }}>No collections match. Start one from a Legal Hold or a DSAR.</div>}
        {filtered.map((c) => {
          const href = openHref(c);
          const s = SOURCE[c.origin] || { label: c.origin, col: C.t3 };
          const st = STAGE[c.stage] || { label: c.stage, col: C.t3 };
          const pct = c.itemCount ? Math.round((c.codedCount / c.itemCount) * 100) : 0;
          return (
            <div key={c.id} onClick={() => href && (window.location.href = href)} style={{ display: "grid", gridTemplateColumns: "1fr 130px 110px 150px 120px", gap: 0, padding: "13px 18px", borderBottom: `1px solid ${C.br}44`, alignItems: "center", cursor: href ? "pointer" : "default" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                <div style={{ fontSize: 11, color: C.t4, fontFamily: M, marginTop: 2 }}>{c.custodianCount} custodian(s){c.simulated ? " · simulated" : ""}</div>
              </div>
              <div><span style={badge(s.col)}>{s.label}</span></div>
              <div><span style={badge(st.col)}>{st.label}</span></div>
              <div>
                <div style={{ height: 6, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, overflow: "hidden", width: 110 }}><div style={{ width: `${pct}%`, height: "100%", background: C.bl }} /></div>
                <div style={{ fontSize: 10.5, color: C.t4, fontFamily: M, marginTop: 3 }}>{c.codedCount}/{c.itemCount} coded</div>
              </div>
              <div style={{ textAlign: "right", fontFamily: M, fontSize: 14, color: C.t2 }}>{c.itemCount}{href && <span style={{ color: C.cy, marginLeft: 8 }}>→</span>}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NewCollectionModal({ onClose }) {
  const [name, setName] = useState("");
  const [src, setSrc] = useState("INVESTIGATION");
  const [ids, setIds] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inp = { width: "100%", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 8, color: C.t1, fontFamily: F, fontSize: 13.5, padding: "10px 12px", outline: "none", boxSizing: "border-box" };

  const create = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/review/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, source: src, identifiers: ids }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      window.location.href = `/review/collections/${d.reviewSet.id}`;
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(4,7,15,.72)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: "92%", background: C.cd, border: `1px solid ${C.brL}`, borderRadius: 14, padding: "24px 26px" }}>
        <div style={{ fontFamily: SR, fontSize: 19, fontWeight: 600, marginBottom: 4 }}>New collection</div>
        <div style={{ fontSize: 12.5, color: C.t3, marginBottom: 18 }}>Collect a custodian set for an internal investigation or ad-hoc culling — no hold or DSAR required. It lands in the same Collect &rarr; Cull &rarr; Review &rarr; Produce workspace.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 5 }}>Name</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Project Falcon — trade-secret review" style={inp} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 5 }}>Type</div>
            <select value={src} onChange={(e) => setSrc(e.target.value)} style={inp}>
              <option value="INVESTIGATION">Internal investigation</option>
              <option value="ADHOC">Ad-hoc culling / export</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 5 }}>Custodians — emails / UPNs (one per line or comma-separated)</div>
            <textarea value={ids} onChange={(e) => setIds(e.target.value)} rows={4} placeholder={"priya.kulkarni@...\nmarcus.reid@..."} style={{ ...inp, fontFamily: M, fontSize: 12, resize: "vertical" }} />
          </div>
          {err && <div style={{ fontSize: 12, color: C.rd }}>{err}</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: "10px 16px", background: "transparent", color: C.t3, border: `1px solid ${C.t3}`, borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button disabled={busy || !ids.trim()} onClick={create} style={{ padding: "10px 18px", background: C.gn, color: C.bg, border: "none", borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{busy ? "Collecting..." : "Collect →"}</button>
        </div>
      </div>
    </div>
  );
}
