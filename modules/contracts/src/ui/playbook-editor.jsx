import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

// ── Structured Playbook editor (PR B) ─────────────────────────────────
//
// Admin surface for the typed contract playbook: per clause a Preferred /
// Fallback(s) / Walk-away position + required-language + guidance + escalation
// trigger. Create a playbook, edit its rules, publish a version, and
// bootstrap from executed precedent (each proposed rule is human-approved).
// Gated admin:contracts:playbooks_manage server-side.

const card = { background: C.cd, border: `1px solid ${C.br}`, borderRadius: 10, padding: 16 };
const inp = { width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, color: C.t1, fontFamily: F, fontSize: 12, padding: "7px 9px" };
const lbl = { fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3, display: "block" };
const btn = (fill, fg) => ({ padding: "7px 12px", background: fill, color: fg, border: `1px solid ${fill === "transparent" ? C.br : fill}`, borderRadius: 5, fontFamily: M, fontSize: 9.5, letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 700, cursor: "pointer" });
const gradePill = (g) => ({ STANDARD: C.gn, FALLBACK: C.am, ESCALATE: C.rd, MISSING: C.rd }[g] || C.t3);

async function api(url, opts) {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

const EMPTY_RULE = { clauseType: "", clauseCode: "", title: "", preferredText: "", fallbackTexts: [""], walkAwayText: "", required: false, requiredLanguage: "", guidance: "", escalationTrigger: "" };

export function PlaybookEditor() {
  const [playbooks, setPlaybooks] = useState([]);
  const [selId, setSelId] = useState(null);
  const [sel, setSel] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [draft, setDraft] = useState(null); // rule being edited
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const loadList = useCallback(async () => {
    try { const d = await api("/api/admin/contracts/playbooks"); setPlaybooks(d.playbooks || []); }
    catch (e) { setErr(String(e.message || e)); }
  }, []);
  const loadOne = useCallback(async (id) => {
    if (!id) { setSel(null); setDecisions([]); return; }
    try {
      const d = await api(`/api/admin/contracts/playbooks/${id}`); setSel(d.playbook);
      const g = await api(`/api/admin/contracts/playbooks/${id}/generate?pending=1`); setDecisions(g.decisions || []);
    } catch (e) { setErr(String(e.message || e)); }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadOne(selId); }, [selId, loadOne]);

  const run = async (fn, okMsg) => {
    setBusy(true); setErr(null); setMsg(null);
    try { await fn(); if (okMsg) setMsg(okMsg); } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };

  const ensureDefault = () => run(async () => {
    const d = await api("/api/admin/contracts/playbooks", { method: "POST", body: JSON.stringify({ action: "ensure-default" }) });
    await loadList(); if (d.playbook) setSelId(d.playbook.id);
  }, "Default playbook ready.");

  const createNew = () => run(async () => {
    const name = window.prompt("New playbook name", "NDA playbook");
    if (!name) return;
    const d = await api("/api/admin/contracts/playbooks", { method: "POST", body: JSON.stringify({ name }) });
    await loadList(); setSelId(d.playbook.id);
  });

  const saveRule = (rule) => run(async () => {
    await api(`/api/admin/contracts/playbooks/${selId}`, { method: "PUT", body: JSON.stringify({ action: "upsert-rule", rule: { ...rule, fallbackTexts: (rule.fallbackTexts || []).filter((t) => t && t.trim()) } }) });
    setDraft(null); await loadOne(selId);
  }, "Rule saved.");

  const deleteRule = (ruleId) => run(async () => {
    if (!window.confirm("Delete this rule?")) return;
    await api(`/api/admin/contracts/playbooks/${selId}`, { method: "PUT", body: JSON.stringify({ action: "delete-rule", ruleId }) });
    await loadOne(selId);
  });

  const publish = () => run(async () => {
    const note = window.prompt("Publish note (optional)", "") ?? undefined;
    await api(`/api/admin/contracts/playbooks/${selId}`, { method: "PUT", body: JSON.stringify({ action: "publish", note }) });
    await loadList(); await loadOne(selId);
  }, "Published.");

  const generate = () => run(async () => {
    await api(`/api/admin/contracts/playbooks/${selId}/generate`, { method: "POST", body: JSON.stringify({ action: "generate" }) });
    await loadOne(selId);
  }, "Proposed rules from precedent — review below.");

  const resolve = (decisionId, verdict) => run(async () => {
    await api(`/api/admin/contracts/playbooks/${selId}/generate`, { method: "POST", body: JSON.stringify({ action: "resolve", decisionId, verdict }) });
    await loadOne(selId);
  });

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24, fontFamily: F, color: C.t1 }}>
      <div style={{ fontSize: 20, fontFamily: SR, marginBottom: 4 }}>📖 Contract Playbooks</div>
      <div style={{ fontSize: 12, color: C.t3, marginBottom: 18, lineHeight: 1.5, maxWidth: 740 }}>
        Typed Preferred / Fallback / Walk-away positions per clause. This is what Review grades against and what seeds drafting. Publishing freezes an immutable version. “Generate from precedent” proposes rules from your executed contracts — every proposed rule needs a human approve before it goes live.
      </div>
      {err && <div style={{ color: C.rd, fontFamily: M, fontSize: 11, marginBottom: 10 }}>⚠ {err}</div>}
      {msg && <div style={{ color: C.gn, fontFamily: M, fontSize: 11, marginBottom: 10 }}>✓ {msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 18, alignItems: "start" }}>
        {/* left: list */}
        <div style={{ ...card }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            <button style={btn(C.bl, "#fff")} disabled={busy} onClick={createNew}>+ New</button>
            <button style={btn("transparent", C.t2)} disabled={busy} onClick={ensureDefault} title="Create a default playbook from the clause library if none exists">Ensure default</button>
          </div>
          {playbooks.length === 0 && <div style={{ fontSize: 11, color: C.t4 }}>No playbooks yet.</div>}
          {playbooks.map((p) => (
            <button key={p.id} onClick={() => setSelId(p.id)} style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 6, padding: "8px 10px", borderRadius: 7, cursor: "pointer", background: selId === p.id ? `${C.bl}1a` : "transparent", border: `1px solid ${selId === p.id ? C.bl : C.br}`, color: C.t1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 9.5, fontFamily: M, color: C.t3, marginTop: 2 }}>
                <span style={{ color: p.status === "PUBLISHED" ? C.gn : p.status === "ARCHIVED" ? C.t4 : C.am }}>{p.status}</span> · v{p.version} · {p.ruleCount} rules
                {p.contractType ? ` · ${p.contractType}` : ""}{p.perspective ? ` · ${p.perspective}` : ""}
              </div>
            </button>
          ))}
        </div>

        {/* right: selected playbook */}
        <div>
          {!sel && <div style={{ ...card, color: C.t3, fontSize: 12 }}>Select a playbook, or create one.</div>}
          {sel && (
            <>
              <div style={{ ...card, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 15, fontFamily: SR }}>{sel.name}</div>
                  <div style={{ fontSize: 10, fontFamily: M, color: C.t3, marginTop: 2 }}>{sel.status} · v{sel.version} · {sel.rules?.length || 0} rules</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button style={btn("transparent", C.t2)} disabled={busy} onClick={generate}>⟐ Generate from precedent</button>
                  <button style={btn(C.gn, "#fff")} disabled={busy || !(sel.rules?.length)} onClick={publish}>Publish version</button>
                </div>
              </div>

              {/* pending generated proposals */}
              {decisions.length > 0 && (
                <div style={{ ...card, marginBottom: 14, borderColor: C.am }}>
                  <div style={{ fontSize: 12, fontFamily: SR, color: C.am, marginBottom: 8 }}>⟐ {decisions.length} proposed rule{decisions.length > 1 ? "s" : ""} from precedent — approve to make live</div>
                  {decisions.map((d) => (
                    <div key={d.decisionId} style={{ borderTop: `1px solid ${C.br}`, padding: "9px 0", display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 600 }}>{d.proposed?.title} <span style={{ fontFamily: M, fontSize: 9, color: C.t4 }}>{d.proposed?.clauseCode}</span></div>
                        <div style={{ fontSize: 11, color: C.t2, marginTop: 3, lineHeight: 1.45 }}>{String(d.proposed?.preferredText || "").slice(0, 280)}</div>
                        <div style={{ fontSize: 9.5, fontFamily: M, color: C.t4, marginTop: 3 }}>{d.proposed?.occurrences} precedent match{d.proposed?.occurrences === 1 ? "" : "es"} · {d.proposed?.fallbackTexts?.length || 0} fallback(s)</div>
                      </div>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button style={btn(C.gn, "#fff")} disabled={busy} onClick={() => resolve(d.decisionId, "approve")}>Approve</button>
                        <button style={btn("transparent", C.rd)} disabled={busy} onClick={() => resolve(d.decisionId, "reject")}>Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* rules */}
              <div style={{ ...card }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontFamily: SR }}>Rules</div>
                  <button style={btn(C.bl, "#fff")} disabled={busy || sel.status === "ARCHIVED"} onClick={() => setDraft({ ...EMPTY_RULE })}>+ Add rule</button>
                </div>
                {(sel.rules || []).length === 0 && !draft && <div style={{ fontSize: 11, color: C.t4 }}>No rules yet — add one, or generate from precedent.</div>}
                {(sel.rules || []).map((r) => (
                  <div key={r.id} style={{ borderTop: `1px solid ${C.br}`, padding: "10px 0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{r.title} <span style={{ fontFamily: M, fontSize: 9, color: C.t4 }}>{r.clauseCode}</span>{r.required && <span style={{ marginLeft: 6, fontSize: 8.5, fontFamily: M, color: C.rd, border: `1px solid ${C.rd}`, borderRadius: 3, padding: "1px 5px" }}>REQUIRED</span>}</div>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button style={btn("transparent", C.t2)} onClick={() => setDraft({ ...r, fallbackTexts: r.fallbackTexts?.length ? r.fallbackTexts : [""] })}>Edit</button>
                        <button style={btn("transparent", C.rd)} disabled={busy} onClick={() => deleteRule(r.id)}>Delete</button>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: C.t2, marginTop: 4, lineHeight: 1.45 }}><b style={{ color: C.gn }}>Preferred:</b> {r.preferredText}</div>
                    {r.fallbackTexts?.length > 0 && <div style={{ fontSize: 10.5, color: C.t3, marginTop: 3 }}><b style={{ color: C.am }}>Fallback:</b> {r.fallbackTexts.join("  |  ")}</div>}
                    {r.walkAwayText && <div style={{ fontSize: 10.5, color: C.t3, marginTop: 3 }}><b style={{ color: C.rd }}>Walk-away:</b> {r.walkAwayText}</div>}
                    {r.guidance && <div style={{ fontSize: 10, color: C.t4, marginTop: 3, fontStyle: "italic" }}>{r.guidance}</div>}
                  </div>
                ))}
              </div>

              {draft && <RuleForm draft={draft} setDraft={setDraft} onSave={saveRule} onCancel={() => setDraft(null)} busy={busy} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RuleForm({ draft, setDraft, onSave, onCancel, busy }) {
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const setFb = (i, v) => setDraft((d) => { const f = [...(d.fallbackTexts || [])]; f[i] = v; return { ...d, fallbackTexts: f }; });
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 620, maxWidth: "100%", maxHeight: "90vh", overflow: "auto", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, padding: 20 }}>
        <div style={{ fontSize: 14, fontFamily: SR, marginBottom: 12 }}>{draft.id ? "Edit rule" : "New rule"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Clause type</label><input style={inp} value={draft.clauseType} onChange={(e) => set("clauseType", e.target.value)} placeholder="LIABILITY_CAP" /></div>
          <div><label style={lbl}>Clause code</label><input style={inp} value={draft.clauseCode} onChange={(e) => set("clauseCode", e.target.value)} placeholder="C.LIAB.CAP" /></div>
        </div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Title</label><input style={inp} value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="Liability cap" /></div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Preferred position</label><textarea rows={3} style={{ ...inp, resize: "vertical" }} value={draft.preferredText} onChange={(e) => set("preferredText", e.target.value)} /></div>
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>Fallback position(s)</label>
          {(draft.fallbackTexts || [""]).map((f, i) => (
            <textarea key={i} rows={2} style={{ ...inp, resize: "vertical", marginBottom: 6 }} value={f} onChange={(e) => setFb(i, e.target.value)} placeholder={`Fallback ${i + 1}`} />
          ))}
          <button style={btn("transparent", C.t2)} onClick={() => set("fallbackTexts", [...(draft.fallbackTexts || []), ""])}>+ Fallback</button>
        </div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Walk-away (non-negotiable)</label><textarea rows={2} style={{ ...inp, resize: "vertical" }} value={draft.walkAwayText} onChange={(e) => set("walkAwayText", e.target.value)} /></div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: C.t2 }}>
            <input type="checkbox" checked={!!draft.required} onChange={(e) => set("required", e.target.checked)} /> Required clause
          </label>
        </div>
        {draft.required && <div style={{ marginBottom: 10 }}><label style={lbl}>Required language (must appear)</label><input style={inp} value={draft.requiredLanguage} onChange={(e) => set("requiredLanguage", e.target.value)} placeholder="e.g. governed by the laws of Delaware" /></div>}
        <div style={{ marginBottom: 10 }}><label style={lbl}>Guidance</label><textarea rows={2} style={{ ...inp, resize: "vertical" }} value={draft.guidance} onChange={(e) => set("guidance", e.target.value)} /></div>
        <div style={{ marginBottom: 14 }}><label style={lbl}>Escalation trigger</label><input style={inp} value={draft.escalationTrigger} onChange={(e) => set("escalationTrigger", e.target.value)} placeholder="e.g. counterparty rejects both preferred and fallback" /></div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button style={btn("transparent", C.t3)} onClick={onCancel}>Cancel</button>
          <button style={btn(C.bl, "#fff")} disabled={busy || !draft.clauseType.trim() || !draft.preferredText.trim()} onClick={() => onSave(draft)}>{busy ? "Saving…" : "Save rule"}</button>
        </div>
      </div>
    </div>
  );
}
