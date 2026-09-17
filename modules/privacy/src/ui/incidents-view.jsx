import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// Privacy Incidents & Breach. List with the GDPR 72-hour regulator-
// notification clock, severity + status, and a detail modal to advance
// status, log mitigations, and record regulator notification (stops the
// clock). Reads/writes /api/privacy/incidents (privacy:incident:respond).

const SEV = { LOW: C.gn, MEDIUM: C.am, HIGH: C.or || C.am, CRITICAL: C.rd };
const STATUS = { REPORTED: C.am, INVESTIGATING: C.bl, CONTAINED: C.cy, RESOLVED: C.gn };
const STATUSES = ["REPORTED", "INVESTIGATING", "CONTAINED", "RESOLVED"];
const SEVS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const pill = (col) => ({ fontSize: 9, fontFamily: M, fontWeight: 700, letterSpacing: .5, textTransform: "uppercase", color: col, border: `1px solid ${col}`, borderRadius: 4, padding: "1px 7px", whiteSpace: "nowrap" });
const input = { background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, color: C.t1, fontFamily: F, fontSize: 12.5, padding: "7px 9px", boxSizing: "border-box" };

async function api(url, opts) { const r = await fetch(url, opts); const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`); return d; }

function ClockBadge({ clock }) {
  if (clock.notified) return <span style={pill(C.gn)}>✓ regulator notified</span>;
  if (clock.breached) return <span style={pill(C.rd)}>⚠ 72h breached</span>;
  const h = clock.hoursRemaining;
  const col = h <= 12 ? C.rd : h <= 36 ? C.am : C.gn;
  return <span style={pill(col)}>{h}h to notify</span>;
}

function DetailModal({ id, onClose, onChanged }) {
  const [x, setX] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mit, setMit] = useState("");
  const load = useCallback(() => { api(`/api/privacy/incidents/${id}`).then((d) => setX(d.incident)).catch((e) => setErr(String(e.message || e))); }, [id]);
  useEffect(() => { load(); }, [load]);

  const put = async (body) => { setBusy(true); setErr(null); try { const d = await api(`/api/privacy/incidents/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); setX(d.incident); if (onChanged) onChanged(); } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); } };
  const notify = async () => { setBusy(true); setErr(null); try { const d = await api(`/api/privacy/incidents/${id}/notify`, { method: "POST" }); setX(d.incident); if (onChanged) onChanged(); } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); } };
  const addMit = () => { if (!mit.trim()) return; put({ mitigationSteps: [...x.mitigationSteps, mit.trim()] }); setMit(""); };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,16,32,.9)", zIndex: 130, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, width: "100%", maxWidth: 640, maxHeight: "88vh", overflowY: "auto", fontFamily: F, color: C.t1, padding: 20 }}>
        {!x && !err && <div style={{ padding: 30, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12 }}>◎ Loading…</div>}
        {err && <div style={{ padding: 10, color: C.rd, fontFamily: M, fontSize: 12 }}>⚠ {err}</div>}
        {x && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1.5, textTransform: "uppercase" }}>Privacy incident</div>
                <div style={{ fontSize: 16, fontFamily: SR }}>{x.description || "(no description)"}</div>
                <div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, marginTop: 3 }}>Discovered {new Date(x.discoveredAt).toLocaleString()} · {x.affectedRecordsCount} records</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
                <span style={pill(SEV[x.severity] || C.t3)}>{x.severity}</span>
                <ClockBadge clock={x.clock} />
              </div>
            </div>

            <label style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: .8, textTransform: "uppercase" }}>Status</label>
            <div style={{ display: "flex", gap: 6, margin: "6px 0 14px", flexWrap: "wrap" }}>
              {STATUSES.map((s) => <button key={s} onClick={() => put({ status: s })} style={{ ...pill(x.status === s ? C.bg : STATUS[s]), background: x.status === s ? (STATUS[s]) : "transparent", cursor: "pointer" }}>{s}</button>)}
            </div>

            <label style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: .8, textTransform: "uppercase" }}>Mitigation steps</label>
            <div style={{ margin: "6px 0" }}>
              {x.mitigationSteps.map((m, i) => <div key={i} style={{ fontSize: 11.5, color: C.t2, padding: "2px 0" }}>• {m}</div>)}
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <input value={mit} onChange={(e) => setMit(e.target.value)} placeholder="log a step taken" style={{ ...input, flex: 1 }} />
                <button onClick={addMit} style={{ padding: "6px 12px", background: C.tl, color: C.bg, border: "none", borderRadius: 5, fontFamily: M, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Add</button>
              </div>
            </div>

            {err && <div style={{ color: C.rd, fontSize: 12, margin: "8px 0" }}>⚠ {err}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
              {!x.regulatorNotified && <button onClick={busy ? undefined : notify} style={{ padding: "8px 14px", background: x.clock.breached ? C.rd : C.am, color: C.bg, border: "none", borderRadius: 6, fontFamily: M, fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer" }}>Record regulator notification</button>}
              {x.regulatorNotified && <span style={{ fontSize: 11, color: C.gn, fontFamily: M }}>✓ Regulator notified {x.reportedAt ? `· ${new Date(x.reportedAt).toLocaleDateString()}` : ""}</span>}
              <button onClick={onClose} style={{ marginLeft: "auto", padding: "8px 12px", border: `1px solid ${C.br}`, color: C.t2, fontSize: 10, fontFamily: M, letterSpacing: 1, textTransform: "uppercase", borderRadius: 6, cursor: "pointer" }}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function NewModal({ onClose, onCreated }) {
  const [f, setF] = useState({ severity: "HIGH", description: "", affectedRecordsCount: 0, discoveredAt: "" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const create = async () => {
    setBusy(true); setErr(null);
    try { await api("/api/privacy/incidents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, affectedRecordsCount: Number(f.affectedRecordsCount) || 0, discoveredAt: f.discoveredAt || undefined }) }); onCreated(); }
    catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,16,32,.9)", zIndex: 130, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, width: "100%", maxWidth: 520, fontFamily: F, color: C.t1, padding: 20 }}>
        <div style={{ fontSize: 16, fontFamily: SR, marginBottom: 14 }}>Report a privacy incident</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={{ fontSize: 9, fontFamily: M, color: C.t3 }}>SEVERITY</label><select value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })} style={{ ...input, width: "100%" }}>{SEVS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          <div><label style={{ fontSize: 9, fontFamily: M, color: C.t3 }}>AFFECTED RECORDS</label><input type="number" value={f.affectedRecordsCount} onChange={(e) => setF({ ...f, affectedRecordsCount: e.target.value })} style={{ ...input, width: "100%" }} /></div>
        </div>
        <label style={{ fontSize: 9, fontFamily: M, color: C.t3 }}>DISCOVERED AT <span style={{ color: C.t4 }}>(blank = now — starts the 72h clock)</span></label>
        <input type="datetime-local" value={f.discoveredAt} onChange={(e) => setF({ ...f, discoveredAt: e.target.value })} style={{ ...input, width: "100%", marginBottom: 10 }} />
        <label style={{ fontSize: 9, fontFamily: M, color: C.t3 }}>DESCRIPTION</label>
        <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} style={{ ...input, width: "100%", resize: "vertical", marginBottom: 10 }} />
        {err && <div style={{ color: C.rd, fontSize: 12, marginBottom: 8 }}>⚠ {err}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ padding: "8px 14px", border: `1px solid ${C.br}`, color: C.t2, background: "transparent", borderRadius: 6, fontFamily: F, fontSize: 12.5, cursor: "pointer" }}>Cancel</button>
          <button onClick={busy ? undefined : create} style={{ padding: "8px 16px", background: C.tl, color: C.bg, border: "none", borderRadius: 6, fontFamily: F, fontSize: 12.5, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? .6 : 1 }}>Report</button>
        </div>
      </div>
    </div>
  );
}

export function IncidentsView() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => { api("/api/privacy/incidents").then((d) => setRows(d.items)).catch((e) => setErr(String(e.message || e))); }, []);
  useEffect(() => { load(); }, [load]);

  const openBreaching = rows ? rows.filter((r) => !r.clock.notified && (r.clock.breached || r.clock.hoursRemaining <= 24)).length : 0;

  return (
    <div style={{ fontFamily: F, color: C.t1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontFamily: SR }}>Incidents &amp; Breach</div>
          <div style={{ fontSize: 12, color: C.t3, fontFamily: M, marginTop: 2 }}>Incident response with the GDPR 72-hour regulator-notification clock.{openBreaching > 0 && <span style={{ color: C.rd }}> · {openBreaching} need attention</span>}</div>
        </div>
        <button onClick={() => setCreating(true)} style={{ padding: "9px 15px", background: C.tl, color: C.bg, border: "none", borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Report incident</button>
      </div>

      {err && <div style={{ color: C.rd, fontFamily: M, fontSize: 12, marginBottom: 10 }}>⚠ {err}</div>}
      {!rows && !err && <div style={{ padding: 30, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12 }}>◎ Loading…</div>}
      {rows && rows.length === 0 && <div style={{ padding: 30, textAlign: "center", color: C.t4, fontFamily: M, fontSize: 12 }}>No incidents recorded.</div>}

      <div style={{ display: "grid", gap: 8 }}>
        {(rows || []).map((x) => (
          <div key={x.id} onClick={() => setOpenId(x.id)} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 12, alignItems: "center", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, padding: "11px 14px", cursor: "pointer" }}>
            <div>
              <div style={{ fontSize: 13, color: C.t1 }}>{x.description || "(no description)"}</div>
              <div style={{ fontSize: 10, color: C.t4, fontFamily: M }}>Discovered {new Date(x.discoveredAt).toLocaleDateString()} · {x.affectedRecordsCount} records</div>
            </div>
            <span style={pill(SEV[x.severity] || C.t3)}>{x.severity}</span>
            <span style={pill(STATUS[x.status] || C.t3)}>{x.status}</span>
            <ClockBadge clock={x.clock} />
          </div>
        ))}
      </div>

      {openId && <DetailModal id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
      {creating && <NewModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
    </div>
  );
}
