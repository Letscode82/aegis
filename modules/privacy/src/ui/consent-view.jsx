import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// Consent & preference management. Active/withdrawn consents per data
// subject + purpose, with a record-consent form and one-click withdraw
// (proof-of-consent audit). Reads/writes /api/privacy/consent.

const MECHANISMS = ["EXPLICIT", "LEGITIMATE_INTEREST", "CONTRACT", "LEGAL_OBLIGATION", "VITAL_INTEREST", "PUBLIC_TASK"];
const input = { background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, color: C.t1, fontFamily: F, fontSize: 12.5, padding: "7px 9px", boxSizing: "border-box", width: "100%" };
const pill = (col) => ({ fontSize: 9, fontFamily: M, fontWeight: 700, letterSpacing: .5, textTransform: "uppercase", color: col, border: `1px solid ${col}`, borderRadius: 4, padding: "1px 7px" });

async function api(url, opts) { const r = await fetch(url, opts); const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`); return d; }

function Tile({ label, value, color }) {
  return (
    <div style={{ flex: 1, minWidth: 110, padding: "12px 14px", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8 }}>
      <div style={{ fontSize: 22, fontFamily: SR, color: color || C.t1 }}>{value}</div>
      <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: .8, textTransform: "uppercase", marginTop: 3 }}>{label}</div>
    </div>
  );
}

function NewModal({ onClose, onCreated }) {
  const [f, setF] = useState({ name: "", email: "", purpose: "", mechanism: "EXPLICIT" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const create = async () => {
    if (!f.name.trim() || !f.purpose.trim()) { setErr("Name and purpose are required"); return; }
    setBusy(true); setErr(null);
    try { await api("/api/privacy/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }); onCreated(); }
    catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,16,32,.9)", zIndex: 130, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, width: "100%", maxWidth: 500, fontFamily: F, color: C.t1, padding: 20 }}>
        <div style={{ fontSize: 16, fontFamily: SR, marginBottom: 14 }}>Record consent</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={{ fontSize: 9, fontFamily: M, color: C.t3 }}>DATA SUBJECT</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="name" style={input} /></div>
          <div><label style={{ fontSize: 9, fontFamily: M, color: C.t3 }}>EMAIL (optional)</label><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="email" style={input} /></div>
        </div>
        <label style={{ fontSize: 9, fontFamily: M, color: C.t3 }}>PURPOSE</label>
        <input value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} placeholder="e.g. Marketing emails" style={{ ...input, marginBottom: 10 }} />
        <label style={{ fontSize: 9, fontFamily: M, color: C.t3 }}>LAWFUL MECHANISM</label>
        <select value={f.mechanism} onChange={(e) => setF({ ...f, mechanism: e.target.value })} style={{ ...input, marginBottom: 10 }}>{MECHANISMS.map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}</select>
        {err && <div style={{ color: C.rd, fontSize: 12, marginBottom: 8 }}>⚠ {err}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ padding: "8px 14px", border: `1px solid ${C.br}`, color: C.t2, background: "transparent", borderRadius: 6, fontFamily: F, fontSize: 12.5, cursor: "pointer" }}>Cancel</button>
          <button onClick={busy ? undefined : create} style={{ padding: "8px 16px", background: C.tl, color: C.bg, border: "none", borderRadius: 6, fontFamily: F, fontSize: 12.5, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? .6 : 1 }}>Record</button>
        </div>
      </div>
    </div>
  );
}

export function ConsentView() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => { api("/api/privacy/consent").then(setData).catch((e) => setErr(String(e.message || e))); }, []);
  useEffect(() => { load(); }, [load]);

  const withdraw = async (id) => { try { await api(`/api/privacy/consent/${id}/withdraw`, { method: "POST" }); load(); } catch (e) { setErr(String(e.message || e)); } };

  return (
    <div style={{ fontFamily: F, color: C.t1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontFamily: SR }}>Consent &amp; Preferences</div>
          <div style={{ fontSize: 12, color: C.t3, fontFamily: M, marginTop: 2 }}>Consent capture per data subject + purpose, with a proof-of-consent audit trail.</div>
        </div>
        <button onClick={() => setCreating(true)} style={{ padding: "9px 15px", background: C.tl, color: C.bg, border: "none", borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Record consent</button>
      </div>

      {err && <div style={{ color: C.rd, fontFamily: M, fontSize: 12, marginBottom: 10 }}>⚠ {err}</div>}
      {data && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <Tile label="Active" value={data.summary.active} color={C.gn} />
          <Tile label="Withdrawn" value={data.summary.withdrawn} color={C.am} />
          <Tile label="Total" value={data.summary.total} />
        </div>
      )}
      {!data && !err && <div style={{ padding: 30, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12 }}>◎ Loading…</div>}
      {data && data.items.length === 0 && <div style={{ padding: 30, textAlign: "center", color: C.t4, fontFamily: M, fontSize: 12 }}>No consent records yet.</div>}

      <div style={{ display: "grid", gap: 8 }}>
        {(data?.items || []).map((c) => (
          <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr auto auto auto", gap: 12, alignItems: "center", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, padding: "10px 14px" }}>
            <div><div style={{ fontSize: 13, color: C.t1 }}>{c.personName}</div>{c.personEmail && <div style={{ fontSize: 10, color: C.t4, fontFamily: M }}>{c.personEmail}</div>}</div>
            <div style={{ fontSize: 12.5, color: C.t2 }}>{c.purpose}</div>
            <span style={{ fontSize: 9.5, color: C.t3, fontFamily: M }}>{c.mechanism.replace(/_/g, " ")}</span>
            <span style={pill(c.active ? C.gn : C.t4)}>{c.active ? "active" : "withdrawn"}</span>
            {c.active
              ? <button onClick={() => withdraw(c.id)} style={{ padding: "5px 10px", border: `1px solid ${C.br}`, color: C.rd, background: "transparent", borderRadius: 5, fontFamily: M, fontSize: 10, cursor: "pointer" }}>Withdraw</button>
              : <span style={{ fontSize: 9.5, color: C.t4, fontFamily: M }}>{c.withdrawnAt ? new Date(c.withdrawnAt).toLocaleDateString() : ""}</span>}
          </div>
        ))}
      </div>

      {creating && <NewModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
    </div>
  );
}
