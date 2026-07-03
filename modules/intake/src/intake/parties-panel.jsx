import { useState, useEffect, useCallback } from "react";
import { C, F, M, Card, inputStyle } from "@aegis/ui";

// ── Track 1 · Activity 5 — parties / people-involved panel ───────────
//
// Surfaces the item-3 parties backend: who is involved in a ticket,
// linked to the SHARED Person / Counterparty entities with a role.
// Reads/writes /api/intake/tickets/[id]/parties + a candidates lookup.

const ROLE_OPTIONS = [
  { value: "adverse_party", label: "Adverse party" },
  { value: "opposing_counsel", label: "Opposing counsel" },
  { value: "our_counsel", label: "Our counsel" },
  { value: "witness", label: "Witness" },
  { value: "requester", label: "Requester" },
  { value: "third_party", label: "Third party" },
  { value: "other", label: "Other" },
];
const roleLabel = (v) => ROLE_OPTIONS.find((r) => r.value === v)?.label || v;
const label = { fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600, marginBottom: 6 };

export function PartiesPanel({ ticket }) {
  const [parties, setParties] = useState(null);
  const [err, setErr] = useState(null);
  const [adding, setAdding] = useState(false);
  const [candidates, setCandidates] = useState({ persons: [], counterparties: [] });
  const [kind, setKind] = useState("counterparty");
  const [entityId, setEntityId] = useState("");
  const [role, setRole] = useState("adverse_party");
  const [note, setNote] = useState("");
  // W3-4 — conflict check result for one party (keyed by party id).
  const [conflict, setConflict] = useState(null); // {partyId, busy, result?, error?}


  const base = `/api/intake/tickets/${encodeURIComponent(ticket.id)}/parties`;
  const load = useCallback(async () => {
    try {
      const r = await fetch(base);
      if (r.status === 403) { setErr("forbidden"); return; }
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Load failed (HTTP ${r.status})`);
      setParties(d.parties || []); setErr(null);
    } catch (e) { setErr(String(e.message || e)); }
  }, [base]);
  useEffect(() => { setParties(null); load(); }, [load]);

  useEffect(() => {
    if (!adding) return;
    fetch("/api/intake/parties/candidates").then((r) => r.json()).then((d) => { if (d.ok) setCandidates({ persons: d.persons || [], counterparties: d.counterparties || [] }); }).catch(() => {});
  }, [adding]);

  const add = async () => {
    if (!entityId) { alert("Pick a person or counterparty."); return; }
    try {
      const body = kind === "person" ? { personId: entityId, role, note: note || null } : { counterpartyId: entityId, role, note: note || null };
      const r = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Add failed (HTTP ${r.status})`);
      setAdding(false); setEntityId(""); setNote(""); load();
    } catch (e) { alert(String(e.message || e)); }
  };
  const remove = async (id) => {
    try {
      const r = await fetch(`${base}/${id}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Remove failed (HTTP ${r.status})`);
      load();
    } catch (e) { alert(String(e.message || e)); }
  };

  // W3-4 — every ticket AND matter involving this entity, one click.
  // The server records the check on the chain-sealed audit ledger.
  const checkConflicts = async (p) => {
    if (conflict?.partyId === p.id && !conflict.busy) { setConflict(null); return; } // toggle off
    setConflict({ partyId: p.id, busy: true });
    try {
      const q = p.kind === "counterparty" ? `counterpartyId=${encodeURIComponent(p.counterpartyId)}` : `personId=${encodeURIComponent(p.personId)}`;
      const r = await fetch(`/api/intake/conflict-check?${q}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || `Check failed (HTTP ${r.status})`);
      setConflict({ partyId: p.id, busy: false, result: d });
    } catch (e) { setConflict({ partyId: p.id, busy: false, error: String(e.message || e) }); }
  };

  if (err === "forbidden") return null;
  const list = kind === "person" ? candidates.persons : candidates.counterparties;
  return (
    <Card style={{ background: C.s1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ ...label, marginBottom: 0 }}>Parties involved{parties ? ` (${parties.length})` : ""}</div>
        {!adding && <span onClick={() => setAdding(true)} style={{ fontSize: 9.5, fontFamily: M, color: C.cy, cursor: "pointer", letterSpacing: .8, fontWeight: 700 }}>+ ADD</span>}
      </div>
      {err && err !== "forbidden" && <div style={{ fontSize: 10.5, color: C.rd, fontFamily: M, marginBottom: 8 }}>{err}</div>}

      {parties === null && !err ? <div style={{ fontSize: 10.5, color: C.t3, fontFamily: M }}>◎ loading…</div> : (
        <>
          {parties && parties.length === 0 && !adding && <div style={{ fontSize: 10.5, color: C.t4, fontFamily: M, padding: "2px 0 6px" }}>No parties recorded. The Litigation agent and manual triage populate these.</div>}
          {parties && parties.map((p) => (
            <div key={p.id} style={{ marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 7px", background: C.s2, borderRadius: 4 }}>
                <span style={{ fontSize: 8, fontFamily: M, color: p.kind === "counterparty" ? C.am : C.cy, letterSpacing: .5 }}>{p.kind === "counterparty" ? "◆" : "●"}</span>
                <span style={{ fontSize: 11, color: C.t1, flex: 1 }}>{p.name || (p.kind === "counterparty" ? p.counterpartyId : p.personId)}</span>
                <span style={{ fontSize: 8.5, fontFamily: M, color: C.t3, letterSpacing: .5, textTransform: "uppercase" }}>{roleLabel(p.role)}</span>
                <span onClick={() => checkConflicts(p)} title="Every ticket and matter involving this party (recorded on the audit ledger)" style={{ fontSize: 9, fontFamily: M, color: conflict?.partyId === p.id ? C.cy : C.tl, cursor: "pointer", letterSpacing: .5, whiteSpace: "nowrap" }}>{conflict?.partyId === p.id && conflict.busy ? "◎…" : "⚖ Conflicts"}</span>
                <span onClick={() => remove(p.id)} title="Remove" style={{ fontSize: 12, color: C.t3, cursor: "pointer" }}>✕</span>
              </div>
              {conflict?.partyId === p.id && !conflict.busy && (
                <div style={{ marginTop: 3, padding: "8px 10px", background: C.s2, border: `1px solid ${C.br}`, borderLeft: `3px solid ${conflict.error ? C.rd : (conflict.result.tickets.length + conflict.result.matters.length > 0 ? C.am : C.gn)}`, borderRadius: 4 }}>
                  {conflict.error ? (
                    <div style={{ fontSize: 10.5, color: C.rd, fontFamily: M }}>{conflict.error}</div>
                  ) : (
                    <>
                      <div style={{ fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>
                        Conflict check · {conflict.result.entity.name} · {conflict.result.tickets.length} ticket{conflict.result.tickets.length === 1 ? "" : "s"} · {conflict.result.matters.length} matter{conflict.result.matters.length === 1 ? "" : "s"}
                      </div>
                      {conflict.result.tickets.length === 0 && conflict.result.matters.length === 0 && (
                        <div style={{ fontSize: 10.5, color: C.gn, fontFamily: M }}>✓ No other engagements found across intake and matters.</div>
                      )}
                      {conflict.result.tickets.map((t) => (
                        <div key={t.id} style={{ fontSize: 10.5, color: C.t2, padding: "2px 0", fontFamily: M }}>
                          <span style={{ color: C.cy }}>{t.id}</span> · {t.type} · {t.status} <span style={{ color: C.t4 }}>· via {t.via.replace(/_/g, " ")}</span>
                          <div style={{ fontSize: 10, color: C.t4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.descSnippet}</div>
                        </div>
                      ))}
                      {conflict.result.matters.map((m) => (
                        <div key={m.id} style={{ fontSize: 10.5, color: C.t2, padding: "2px 0", fontFamily: M }}>
                          <span style={{ color: C.pp }}>{m.matterNumber || "DRAFT"}</span> · {m.title} · {m.status} <span style={{ color: C.t4 }}>· via {m.via.replace(/_/g, " ").toLowerCase()}</span>
                        </div>
                      ))}
                      <div style={{ fontSize: 8.5, color: C.t4, fontFamily: M, marginTop: 5 }}>Check recorded on the audit ledger · {new Date(conflict.result.checkedAt).toLocaleString()}</div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {adding && (
        <div style={{ marginTop: 8, padding: 8, background: C.s2, borderRadius: 4, border: `1px solid ${C.br}` }}>
          <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
            {["counterparty", "person"].map((k) => (
              <div key={k} onClick={() => { setKind(k); setEntityId(""); }} style={{ flex: 1, textAlign: "center", padding: "5px", border: `1px solid ${kind === k ? C.cy : C.br}`, background: kind === k ? C.cy + "18" : C.s1, color: kind === k ? C.cy : C.t3, borderRadius: 3, cursor: "pointer", fontSize: 10, fontFamily: M, textTransform: "capitalize" }}>{k}</div>
            ))}
          </div>
          <select value={entityId} onChange={(e) => setEntityId(e.target.value)} style={{ ...inputStyle, width: "100%", fontSize: 10.5, marginBottom: 6 }}>
            <option value="">Select a {kind}…</option>
            {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ ...inputStyle, width: "100%", fontSize: 10.5, marginBottom: 6 }}>
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{roleLabel(r.value)}</option>)}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" style={{ ...inputStyle, width: "100%", fontSize: 10.5, marginBottom: 6 }} />
          <div style={{ display: "flex", gap: 6 }}>
            <div onClick={add} style={{ flex: 1, textAlign: "center", padding: "6px", background: C.cy, color: C.bg, fontSize: 9.5, fontFamily: M, fontWeight: 700, borderRadius: 3, cursor: "pointer", letterSpacing: .8, textTransform: "uppercase" }}>Add party</div>
            <div onClick={() => setAdding(false)} style={{ padding: "6px 10px", border: `1px solid ${C.br}`, color: C.t2, fontSize: 9.5, fontFamily: M, borderRadius: 3, cursor: "pointer", letterSpacing: .8, textTransform: "uppercase" }}>Cancel</div>
          </div>
        </div>
      )}
    </Card>
  );
}
