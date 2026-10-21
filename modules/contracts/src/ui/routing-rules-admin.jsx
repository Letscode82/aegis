import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Contract approval routing rules (redesign PR 5) ───────────────────
//
// Admin surface for the configurable layer over PR 3's request-driven ladder
// selection. An admin maps a contract condition (type substring / perspective /
// value range) to the approval ladder that should run — so "deals over $250k go
// to the board ladder" or "vendor paper uses the fast review ladder" is
// configuration, not a code change. Rules evaluate in order; the first enabled
// match whose ladder is seeded wins, else the code default runs. Every write is
// chain-sealed (contract.routing_rule.*). Gated admin:manage_users server-side.

// Ladder keys are a stable interface with @aegis/workflow's GOVERNANCE_LIBRARY;
// the UI can't import the workflow package (module isolation), so the catalog is
// mirrored here. Keeping it in sync is cheap — a ladder is added rarely.
const LADDERS = [
  { key: "nda_fasttrack", name: "NDA Fast-Track" },
  { key: "clm_contract_approval", name: "Contract Approval Ladder" },
  { key: "legal_notice", name: "Legal Notice Response" },
  { key: "vendor_onboarding", name: "Vendor / Counterparty Due Diligence" },
  { key: "regulatory_response", name: "Regulatory Action Response" },
  { key: "employment_matter", name: "Employment / POSH Matter" },
  { key: "board_approval", name: "Board / Secretarial Approval" },
];
const ladderName = (k) => LADDERS.find((l) => l.key === k)?.name || k;

const PERSPECTIVES = [
  { key: "", label: "Any" },
  { key: "OUR_SIDE", label: "Our side" },
  { key: "THEIR_SIDE", label: "Their side" },
  { key: "MUTUAL", label: "Mutual" },
  { key: "NEUTRAL", label: "Neutral" },
];

const wrap = { maxWidth: 980, margin: "0 auto", padding: "28px 20px", fontFamily: F, color: C.t1 };
const card = { background: C.cd, border: `1px solid ${C.br}`, borderRadius: 10, padding: 16 };
const inp = { width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, color: C.t1, fontFamily: F, fontSize: 12, padding: "7px 9px" };
const lbl = { fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3, display: "block" };
const btn = (fill, fg) => ({ padding: "7px 12px", background: fill, color: fg, border: `1px solid ${fill === "transparent" ? C.br : fill}`, borderRadius: 5, fontFamily: M, fontSize: 9.5, letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 700, cursor: "pointer" });
const chip = (bg, fg) => ({ display: "inline-block", padding: "2px 7px", borderRadius: 4, background: bg, color: fg, fontFamily: M, fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 700 });

async function api(url, opts) {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

const EMPTY = { name: "", setLadderKey: "clm_contract_approval", matchType: "", matchPerspective: "", minValue: "", maxValue: "", evalOrder: 100, description: "" };

function conditionSummary(r) {
  const parts = [];
  if (r.matchType) parts.push(`type contains “${r.matchType}”`);
  if (r.matchPerspective) parts.push(`perspective = ${PERSPECTIVES.find((p) => p.key === r.matchPerspective)?.label || r.matchPerspective}`);
  if (r.minValue != null && r.maxValue != null) parts.push(`value ${r.minValue.toLocaleString()}–${r.maxValue.toLocaleString()}`);
  else if (r.minValue != null) parts.push(`value ≥ ${r.minValue.toLocaleString()}`);
  else if (r.maxValue != null) parts.push(`value ≤ ${r.maxValue.toLocaleString()}`);
  return parts.length ? parts.join(" · ") : "no conditions";
}

export function RoutingRulesAdmin() {
  const [rules, setRules] = useState([]);
  const [draft, setDraft] = useState(null); // create form, or null
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try { const d = await api("/api/admin/contracts/routing-rules"); setRules(d.rules || []); }
    catch (e) { setErr(String(e.message || e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, okMsg) => {
    setBusy(true); setErr(null); setMsg(null);
    try { await fn(); if (okMsg) setMsg(okMsg); } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };

  const bodyFromDraft = (d) => ({
    name: d.name.trim(),
    setLadderKey: d.setLadderKey,
    matchType: d.matchType.trim() || null,
    matchPerspective: d.matchPerspective || null,
    minValue: d.minValue === "" ? null : Number(d.minValue),
    maxValue: d.maxValue === "" ? null : Number(d.maxValue),
    evalOrder: Number(d.evalOrder) || 100,
    description: d.description.trim() || null,
  });

  const create = () => run(async () => {
    await api("/api/admin/contracts/routing-rules", { method: "POST", body: JSON.stringify(bodyFromDraft(draft)) });
    setDraft(null); await load();
  }, "Rule created.");

  const toggle = (r) => run(async () => {
    await api(`/api/admin/contracts/routing-rules/${r.id}`, { method: "PUT", body: JSON.stringify({ enabled: !r.enabled }) });
    await load();
  });

  const remove = (r) => run(async () => {
    if (!window.confirm(`Delete routing rule “${r.name}”?`)) return;
    await api(`/api/admin/contracts/routing-rules/${r.id}`, { method: "DELETE" });
    await load();
  }, "Rule deleted.");

  return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
        <h1 style={{ fontFamily: SR, fontSize: 22, margin: 0, color: C.t1 }}>Contract approval routing</h1>
        {!draft && <button style={btn(C.bl, "#fff")} onClick={() => setDraft({ ...EMPTY })}>+ New rule</button>}
      </div>
      <p style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.5, maxWidth: 680, marginTop: 4 }}>
        Map a contract condition to the approval ladder it should run. Rules evaluate top-down in order; the
        first enabled match wins. When nothing matches, the request-driven default applies (NDAs fast-track,
        everything else takes the full ladder).
      </p>

      {err && <div style={{ ...card, borderColor: C.rd, color: C.rd, marginTop: 12, fontSize: 12 }}>{err}</div>}
      {msg && <div style={{ ...card, borderColor: C.gn, color: C.gn, marginTop: 12, fontSize: 12 }}>{msg}</div>}

      {draft && (
        <div style={{ ...card, marginTop: 14 }}>
          <div style={{ fontFamily: M, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: C.t3, marginBottom: 12 }}>New routing rule</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Rule name</label>
              <input style={inp} value={draft.name} placeholder="High-value deals → board" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div>
              <label style={lbl}>Route to ladder</label>
              <select style={inp} value={draft.setLadderKey} onChange={(e) => setDraft({ ...draft, setLadderKey: e.target.value })}>
                {LADDERS.map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Evaluation order</label>
              <input style={inp} type="number" value={draft.evalOrder} onChange={(e) => setDraft({ ...draft, evalOrder: e.target.value })} />
            </div>
            <div style={{ gridColumn: "1 / -1", borderTop: `1px solid ${C.br}`, paddingTop: 10, fontFamily: M, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: C.t3 }}>
              Conditions — at least one (all set conditions must match)
            </div>
            <div>
              <label style={lbl}>Contract type contains</label>
              <input style={inp} value={draft.matchType} placeholder="e.g. NDA, supply, license" onChange={(e) => setDraft({ ...draft, matchType: e.target.value })} />
            </div>
            <div>
              <label style={lbl}>Perspective</label>
              <select style={inp} value={draft.matchPerspective} onChange={(e) => setDraft({ ...draft, matchPerspective: e.target.value })}>
                {PERSPECTIVES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Min value</label>
              <input style={inp} type="number" value={draft.minValue} placeholder="(none)" onChange={(e) => setDraft({ ...draft, minValue: e.target.value })} />
            </div>
            <div>
              <label style={lbl}>Max value</label>
              <input style={inp} type="number" value={draft.maxValue} placeholder="(none)" onChange={(e) => setDraft({ ...draft, maxValue: e.target.value })} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={btn(C.bl, "#fff")} disabled={busy} onClick={create}>Create rule</button>
            <button style={btn("transparent", C.t2)} disabled={busy} onClick={() => { setDraft(null); setErr(null); }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
        {rules.length === 0 && !draft && (
          <div style={{ ...card, color: C.t3, fontSize: 12.5, textAlign: "center", padding: 28 }}>
            No routing rules yet. The request-driven default is in effect. Add a rule to override it for specific contracts.
          </div>
        )}
        {rules.map((r) => (
          <div key={r.id} style={{ ...card, opacity: r.enabled ? 1 : 0.55, display: "flex", alignItems: "flex-start", gap: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: M, fontSize: 9.5, color: C.t3 }}>#{r.evalOrder}</span>
                <span style={{ fontWeight: 700, fontSize: 13.5, color: C.t1 }}>{r.name}</span>
                {r.enabled ? <span style={chip("rgba(52,199,120,0.14)", C.gn)}>Enabled</span> : <span style={chip(C.bg, C.t3)}>Disabled</span>}
              </div>
              <div style={{ fontSize: 12, color: C.t2, marginTop: 6 }}>
                When <strong style={{ color: C.t1 }}>{conditionSummary(r)}</strong> → route to <strong style={{ color: C.bl }}>{ladderName(r.setLadderKey)}</strong>
              </div>
              <div style={{ fontFamily: M, fontSize: 9.5, color: C.t3, marginTop: 6 }}>
                Fired {r.timesFired}× {r.lastFiredAt ? `· last ${new Date(r.lastFiredAt).toLocaleDateString()}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button style={btn("transparent", C.t2)} disabled={busy} onClick={() => toggle(r)}>{r.enabled ? "Disable" : "Enable"}</button>
              <button style={btn("transparent", C.rd)} disabled={busy} onClick={() => remove(r)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
