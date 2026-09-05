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
  const [ingestBusy, setIngestBusy] = useState(false);
  const [ingestErr, setIngestErr] = useState("");

  useEffect(() => {
    fetch("/api/review/collections").then((r) => r.json()).then((d) => setRows(d.ok ? d.collections : [])).catch(() => setRows([]));
  }, []);

  // PROC-6: ingest an uploaded ZIP / MBOX archive → review set.
  async function onIngestFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setIngestErr("");
    if (file.size > 3_500_000) {
      setIngestErr(`"${file.name}" is ${(file.size / 1e6).toFixed(1)} MB — over the ~3.5 MB inline cap. Larger archives need the worker path.`);
      return;
    }
    setIngestBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const bytesB64 = btoa(bin);
      const r = await fetch("/api/review/ingest-archive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: file.name, contentType: file.type, bytesB64 }) });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error?.message || "Ingest failed");
      window.location.href = `/review/collections/${d.reviewSet.id}`;
    } catch (err) {
      setIngestErr(String(err?.message || err));
    } finally {
      setIngestBusy(false);
    }
  }

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
        <div style={{ flex: "none", display: "flex", gap: 8, alignItems: "center" }}>
          <label title="Ingest an exported ZIP or MBOX archive into a new review set" style={{ padding: "10px 16px", background: "transparent", color: C.cy, border: `1px solid ${C.cy}`, borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: ingestBusy ? "default" : "pointer", opacity: ingestBusy ? 0.6 : 1 }}>
            {ingestBusy ? "Ingesting…" : "Ingest archive"}
            <input type="file" accept=".zip,.mbox,.eml" onChange={onIngestFile} disabled={ingestBusy} style={{ display: "none" }} />
          </label>
          <button onClick={() => setShowNew(true)} style={{ padding: "10px 16px", background: C.bl, color: C.bg, border: "none", borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ New collection</button>
        </div>
      </div>
      {ingestErr && <div style={{ color: "#f87171", fontSize: 12.5, marginBottom: 10 }}>{ingestErr}</div>}
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

function fmtBytes(n) {
  if (!n || n < 1024) return `${n || 0} B`;
  const u = ["KB", "MB", "GB", "TB"]; let v = n / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
}

function NewCollectionModal({ onClose }) {
  const [name, setName] = useState("");
  const [src, setSrc] = useState("INVESTIGATION");
  const [ids, setIds] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [est, setEst] = useState(null);
  const [estBusy, setEstBusy] = useState(false);
  const inp = { width: "100%", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 8, color: C.t1, fontFamily: F, fontSize: 13.5, padding: "10px 12px", outline: "none", boxSizing: "border-box" };

  const create = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/review/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, source: src, identifiers: ids }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      window.location.href = `/review/collections/${d.reviewSet.id}`;
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };

  const estimate = async () => {
    setEstBusy(true); setErr(""); setEst(null);
    try {
      const r = await fetch("/api/review/collections/estimate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ custodianIdentifiers: ids, displayName: name || undefined }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setEst(d.estimate);
    } catch (e) { setErr(String(e.message || e)); }
    setEstBusy(false);
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
          {est && (
            <div style={{ border: `1px solid ${C.br}`, borderRadius: 10, padding: "12px 14px", background: C.bg }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontFamily: M, letterSpacing: .6, textTransform: "uppercase", color: C.cy }}>Purview tenant-scale estimate</div>
                <span style={{ ...badge(est.status === "COMPLETE" ? C.gn : C.am), fontSize: 9.5 }}>{est.simulated ? "SIMULATED" : est.status}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
                <div><div style={{ fontFamily: SR, fontSize: 20, fontWeight: 600 }}>{(est.estimatedItems || 0).toLocaleString()}</div><div style={{ fontSize: 10.5, color: C.t4, fontFamily: M }}>items</div></div>
                <div><div style={{ fontFamily: SR, fontSize: 20, fontWeight: 600 }}>{fmtBytes(est.estimatedSizeBytes)}</div><div style={{ fontSize: 10.5, color: C.t4, fontFamily: M }}>data volume</div></div>
                <div><div style={{ fontFamily: SR, fontSize: 20, fontWeight: 600 }}>{est.mailboxCount || 0}</div><div style={{ fontSize: 10.5, color: C.t4, fontFamily: M }}>mailboxes</div></div>
                <div><div style={{ fontFamily: SR, fontSize: 20, fontWeight: 600 }}>{est.siteCount || 0}</div><div style={{ fontSize: 10.5, color: C.t4, fontFamily: M }}>sites</div></div>
              </div>
              {est.simulated && <div style={{ fontSize: 10.5, color: C.t4, marginTop: 8 }}>Representative numbers — connect eDiscovery (delegated) at /admin/m365 for live tenant statistics.</div>}
            </div>
          )}
          {err && <div style={{ fontSize: 12, color: C.rd }}>{err}</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 20 }}>
          <button disabled={estBusy || !ids.trim()} onClick={estimate} title="Estimate tenant-wide item count via Purview eDiscovery before collecting" style={{ padding: "10px 16px", background: "transparent", color: C.cy, border: `1px solid ${C.cy}`, borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{estBusy ? "Estimating…" : "Estimate scale (Purview)"}</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ padding: "10px 16px", background: "transparent", color: C.t3, border: `1px solid ${C.t3}`, borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            <button disabled={busy || !ids.trim()} onClick={create} style={{ padding: "10px 18px", background: C.gn, color: C.bg, border: "none", borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{busy ? "Collecting..." : "Collect →"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
