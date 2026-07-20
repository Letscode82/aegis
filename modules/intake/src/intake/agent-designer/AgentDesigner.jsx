import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";
import { useToast } from "@aegis/ui";

// ── Agent Designer (oKF-2) ───────────────────────────────────────────
//
// The super-designer surface: a full-screen editor where every aspect of
// an agent's working — identity, routing, model, prompt, knowledge,
// output thresholds, approver risks — is editable and versioned. Draft →
// Preview (dry-run against a sample ticket) → Publish (new immutable
// version, goes live) → revert. Import / export the Open Knowledge Format
// JSON. All writes go through /api/admin/agents (gated admin:agents:manage,
// chain-sealed). It configures WHAT the agent does; the human-approval
// gate is never one of the knobs.

const TABS = ["Identity", "Routing", "Model", "Prompt", "Knowledge", "Output", "Risks", "Versions"];

const lbl = { fontSize: 9.5, fontFamily: M, color: C.t3, letterSpacing: 0.6, textTransform: "uppercase", display: "block", marginBottom: 4 };
const inputStyle = { width: "100%", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 4, color: C.t1, fontFamily: F, fontSize: 12, padding: "7px 9px", boxSizing: "border-box" };
const mono = { ...inputStyle, fontFamily: M, fontSize: 11, lineHeight: 1.5 };

function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={lbl}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 9, fontFamily: M, color: C.t4, marginTop: 3, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

function Toggle({ on, onClick }) {
  return (
    <div onClick={onClick} style={{ width: 34, height: 18, borderRadius: 10, background: on ? C.gn : C.br, position: "relative", cursor: "pointer", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 14, height: 14, borderRadius: "50%", background: C.bg, transition: "left .12s" }} />
    </div>
  );
}

const csv = (arr) => (Array.isArray(arr) ? arr.join(", ") : "");
const fromCsv = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);

export function AgentDesigner({ agentKey, agentName, onClose }) {
  const toast = useToast();
  const [doc, setDoc] = useState(null);
  const [versions, setVersions] = useState([]);
  const [tab, setTab] = useState("Identity");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewTicket, setPreviewTicket] = useState({ from: "Dana Lee", dept: "Engineering", type: "", desc: "" });

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/agents/${agentKey}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((d) => { setDoc(d.document); setVersions(d.versions || []); if (!previewTicket.type) setPreviewTicket((t) => ({ ...t, type: d.document?.agent?.name || "" })); })
      .catch(() => toast.error("Could not load this agent."))
      .finally(() => setLoading(false));
  }, [agentKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // Update a nested path on the agent doc, e.g. set(["agent","model","maxTokens"], 1800).
  const set = (path, value) => setDoc((prev) => {
    const next = structuredClone(prev);
    let node = next;
    for (let i = 0; i < path.length - 1; i++) node = node[path[i]];
    node[path[path.length - 1]] = value;
    return next;
  });
  const a = doc?.agent;

  const saveDraft = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/agents/${agentKey}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document: doc }) });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "save failed");
      toast.success("Draft saved.");
    } catch (e) { toast.error(String(e.message || e)); }
    finally { setBusy(false); }
  };

  const publish = async () => {
    const changeLog = window.prompt("Describe this change (optional):", "");
    if (changeLog === null) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/agents/${agentKey}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document: doc }) });
      const r = await fetch(`/api/admin/agents/${agentKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changeLog }) });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "publish failed");
      (d.published ? toast.success(`Published v${d.version} — live now.`) : toast.info("No changes to publish."));
      load();
    } catch (e) { toast.error(String(e.message || e)); }
    finally { setBusy(false); }
  };

  const runPreview = async () => {
    setBusy(true); setPreview({ loading: true });
    try {
      await fetch(`/api/admin/agents/${agentKey}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document: doc }) });
      const r = await fetch(`/api/admin/agents/${agentKey}/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket: previewTicket }) });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "preview failed");
      setPreview({ rec: d.recommendation });
    } catch (e) { setPreview({ error: String(e.message || e) }); }
    finally { setBusy(false); }
  };

  const revert = async (v) => {
    if (!window.confirm(`Revert to version ${v}? This republishes it as a new version.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/agents/${agentKey}/revert`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toVersion: v }) });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "revert failed");
      toast.success(`Reverted — published as v${d.version}.`);
      load();
    } catch (e) { toast.error(String(e.message || e)); }
    finally { setBusy(false); }
  };

  const doExport = () => { window.open(`/api/admin/agents/${agentKey}/export`, "_blank"); };

  const doImport = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const document = JSON.parse(String(reader.result));
        const r = await fetch(`/api/admin/agents/${agentKey}/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document }) });
        const d = await r.json();
        if (!r.ok || !d.ok) throw new Error((d.errors && d.errors.join("; ")) || d.error || "import failed");
        toast.success("Imported into draft — review, then Publish.");
        load();
      } catch (err) { toast.error(String(err.message || err)); }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "flex-start", overflow: "auto", padding: "24px 16px" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, width: "min(920px, 100%)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${C.br}` }}>
          <div>
            <div style={{ fontSize: 15, fontFamily: SR, color: C.t1 }}>⚙ Agent Designer</div>
            <div style={{ fontSize: 10, fontFamily: M, color: C.t3, marginTop: 1 }}>{agentName || agentKey} · <span style={{ color: C.t4 }}>{agentKey}</span></div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.t3, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {loading || !a ? (
          <div style={{ padding: 40, textAlign: "center", color: C.t3, fontFamily: M, fontSize: 12 }}>Loading…</div>
        ) : (
          <>
            {/* Tabs */}
            <div style={{ display: "flex", gap: 2, padding: "0 12px", borderBottom: `1px solid ${C.br}`, flexWrap: "wrap" }}>
              {TABS.map((t) => (
                <button key={t} onClick={() => setTab(t)} style={{ background: "transparent", border: "none", borderBottom: `2px solid ${tab === t ? C.cy : "transparent"}`, color: tab === t ? C.t1 : C.t3, fontFamily: M, fontSize: 10.5, letterSpacing: 0.5, padding: "10px 10px", cursor: "pointer", fontWeight: tab === t ? 700 : 400 }}>{t}</button>
              ))}
            </div>

            {/* Body */}
            <div style={{ padding: 18, maxHeight: "58vh", overflow: "auto" }}>
              {tab === "Identity" && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <Field label="Name"><input style={inputStyle} value={a.name} onChange={(e) => set(["agent", "name"], e.target.value)} /></Field>
                    <Field label="Short name"><input style={inputStyle} value={a.shortName || ""} onChange={(e) => set(["agent", "shortName"], e.target.value)} /></Field>
                    <Field label="Icon"><input style={inputStyle} value={a.icon || ""} onChange={(e) => set(["agent", "icon"], e.target.value)} /></Field>
                    <Field label="Display order"><input type="number" style={inputStyle} value={a.displayOrder} onChange={(e) => set(["agent", "displayOrder"], Number(e.target.value))} /></Field>
                  </div>
                  <Field label="Description"><textarea rows={2} style={inputStyle} value={a.description || ""} onChange={(e) => set(["agent", "description"], e.target.value)} /></Field>
                  <Field label="Approver role" hint="Optional RBAC hint shown to reviewers."><input style={inputStyle} value={a.approverRole || ""} onChange={(e) => set(["agent", "approverRole"], e.target.value || null)} /></Field>
                  <div style={{ display: "flex", gap: 24, marginTop: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Toggle on={a.enabled} onClick={() => set(["agent", "enabled"], !a.enabled)} /><span style={{ fontSize: 11, color: C.t2, fontFamily: M }}>Enabled</span></div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Toggle on={a.productionReady} onClick={() => set(["agent", "productionReady"], !a.productionReady)} /><span style={{ fontSize: 11, color: C.t2, fontFamily: M }}>Production-ready</span></div>
                  </div>
                </>
              )}

              {tab === "Routing" && (
                <>
                  <div style={{ fontSize: 10, color: C.t3, fontFamily: F, marginBottom: 12, lineHeight: 1.5 }}>Comma-separated. The agent claims a ticket when its category / type / description matches any term (and no exclude term hits). Preferred per-request-type bindings still win over this.</div>
                  <Field label="Match category"><input style={inputStyle} value={csv(a.routing.matchCategory)} onChange={(e) => set(["agent", "routing", "matchCategory"], fromCsv(e.target.value))} /></Field>
                  <Field label="Match type"><input style={inputStyle} value={csv(a.routing.matchType)} onChange={(e) => set(["agent", "routing", "matchType"], fromCsv(e.target.value))} /></Field>
                  <Field label="Match keyword (in description)"><input style={inputStyle} value={csv(a.routing.matchKeyword)} onChange={(e) => set(["agent", "routing", "matchKeyword"], fromCsv(e.target.value))} /></Field>
                  <Field label="Exclude keyword (veto)"><input style={inputStyle} value={csv(a.routing.excludeKeyword)} onChange={(e) => set(["agent", "routing", "excludeKeyword"], fromCsv(e.target.value))} /></Field>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}><Toggle on={a.routing.requiresDocument} onClick={() => set(["agent", "routing", "requiresDocument"], !a.routing.requiresDocument)} /><span style={{ fontSize: 11, color: C.t2, fontFamily: M }}>Requires an attached document</span></div>
                </>
              )}

              {tab === "Model" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <Field label="Model override" hint="Blank = platform default."><input style={inputStyle} value={a.model.model || ""} onChange={(e) => set(["agent", "model", "model"], e.target.value || null)} /></Field>
                  <Field label="Max tokens"><input type="number" style={inputStyle} value={a.model.maxTokens} onChange={(e) => set(["agent", "model", "maxTokens"], Number(e.target.value))} /></Field>
                  <Field label="Timeout (ms)"><input type="number" style={inputStyle} value={a.model.timeout} onChange={(e) => set(["agent", "model", "timeout"], Number(e.target.value))} /></Field>
                  <Field label="Max document chars" hint="Token-budget guard on long docs."><input type="number" style={inputStyle} value={a.model.maxDocChars} onChange={(e) => set(["agent", "model", "maxDocChars"], Number(e.target.value))} /></Field>
                  <Field label="Temperature" hint="Blank = model default."><input type="number" step="0.1" style={inputStyle} value={a.model.temperature ?? ""} onChange={(e) => set(["agent", "model", "temperature"], e.target.value === "" ? null : Number(e.target.value))} /></Field>
                </div>
              )}

              {tab === "Prompt" && (
                <>
                  <Field label="Mode">
                    <select style={inputStyle} value={a.prompt.mode} onChange={(e) => set(["agent", "prompt", "mode"], e.target.value)}>
                      <option value="json">json (structured extraction, with text fallback)</option>
                      <option value="text">text (prose only)</option>
                    </select>
                  </Field>
                  <Field label="System template" hint="Supports {{ticket.from}}, {{ticket.dept}}, {{ticket.firstName}}, {{ticket.desc}}, {{knowledge}}."><textarea rows={8} style={mono} value={a.prompt.systemTemplate} onChange={(e) => set(["agent", "prompt", "systemTemplate"], e.target.value)} /></Field>
                  {a.prompt.mode === "json" && <Field label="JSON contract" hint="Appended to the prompt; defines the required response object."><textarea rows={4} style={mono} value={a.prompt.jsonContract || ""} onChange={(e) => set(["agent", "prompt", "jsonContract"], e.target.value || null)} /></Field>}
                  <Field label="Plain-text fallback template" hint="Used when the JSON call fails (the reliability ladder)."><textarea rows={4} style={mono} value={a.prompt.fallbackTemplate || ""} onChange={(e) => set(["agent", "prompt", "fallbackTemplate"], e.target.value || null)} /></Field>
                </>
              )}

              {tab === "Knowledge" && (
                <>
                  <div style={{ fontSize: 10, color: C.t3, fontFamily: F, marginBottom: 12, lineHeight: 1.5 }}>The packs this agent reads. Full item editing (add / edit / reorder clause codes) + AI authoring lands in the next step — for now this shows what's live.</div>
                  {doc.knowledge.length === 0 && <div style={{ color: C.t4, fontFamily: M, fontSize: 11 }}>No knowledge packs bound.</div>}
                  {doc.knowledge.map((pack) => (
                    <div key={pack.key} style={{ border: `1px solid ${C.br}`, borderRadius: 6, marginBottom: 10 }}>
                      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.br}`, display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, color: C.t1, fontWeight: 600 }}>{pack.name}</span>
                        <span style={{ fontSize: 9, fontFamily: M, color: C.t3 }}>{pack.kind} · {pack.items.length} items</span>
                      </div>
                      <div style={{ padding: "6px 12px" }}>
                        {pack.items.map((it) => (
                          <div key={it.code} style={{ padding: "5px 0", borderBottom: `1px solid ${C.br}22` }}>
                            <div style={{ fontSize: 10, fontFamily: M, color: C.cy }}>{it.code} <span style={{ color: C.t4 }}>· {it.kind}</span></div>
                            <div style={{ fontSize: 11, color: C.t1, fontFamily: F, marginTop: 1 }}>{it.title}</div>
                            {it.bodyMarkdown && <div style={{ fontSize: 10, color: C.t3, fontFamily: F, marginTop: 1, lineHeight: 1.4 }}>{it.bodyMarkdown}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}

              {tab === "Output" && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <Field label="Auto-send at confidence ≥" hint="0–1. At/above → the auto-send action."><input type="number" step="0.01" style={inputStyle} value={a.output.autoSendAtConfidence} onChange={(e) => set(["agent", "output", "autoSendAtConfidence"], Number(e.target.value))} /></Field>
                    <Field label="Degraded confidence" hint="Used when both Claude calls fail."><input type="number" step="0.01" style={inputStyle} value={a.output.degradedConfidence} onChange={(e) => set(["agent", "output", "degradedConfidence"], Number(e.target.value))} /></Field>
                    <Field label="Default action (below threshold)"><input style={inputStyle} value={a.output.defaultAction} onChange={(e) => set(["agent", "output", "defaultAction"], e.target.value)} /></Field>
                    <Field label="Auto-send action (at/above)"><input style={inputStyle} value={a.output.autoSendAction} onChange={(e) => set(["agent", "output", "autoSendAction"], e.target.value)} /></Field>
                  </div>
                  <div style={{ marginTop: 4, padding: "8px 10px", background: C.am + "12", border: `1px solid ${C.am}44`, borderRadius: 4, fontSize: 10, fontFamily: M, color: C.t2, lineHeight: 1.5 }}>
                    ⚖ Governance: regardless of these thresholds, every recommendation still writes a PENDING decision and requires the reviewer's approve keystroke. These tune the <em>suggested</em> action, not whether a human signs off.
                  </div>
                </>
              )}

              {tab === "Risks" && (
                <>
                  <div style={{ fontSize: 10, color: C.t3, fontFamily: F, marginBottom: 12 }}>The "risks to weigh before approving" checklist shown to the reviewer on every recommendation.</div>
                  {(a.risks || []).map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                      <textarea rows={2} style={{ ...inputStyle, flex: 1 }} value={r} onChange={(e) => { const risks = [...a.risks]; risks[i] = e.target.value; set(["agent", "risks"], risks); }} />
                      <button onClick={() => set(["agent", "risks"], a.risks.filter((_, j) => j !== i))} style={{ background: "transparent", border: `1px solid ${C.rd}55`, color: C.rd, borderRadius: 4, cursor: "pointer", fontSize: 12, padding: "0 8px" }}>×</button>
                    </div>
                  ))}
                  <button onClick={() => set(["agent", "risks"], [...(a.risks || []), ""])} style={{ background: "transparent", border: `1px dashed ${C.br}`, color: C.t3, fontFamily: M, fontSize: 10, padding: "6px 12px", borderRadius: 4, cursor: "pointer" }}>+ Add risk</button>
                </>
              )}

              {tab === "Versions" && (
                <>
                  <div style={{ fontSize: 10, color: C.t3, fontFamily: F, marginBottom: 12 }}>Every publish is an immutable version. Reverting republishes a prior spec as a new version (append-only).</div>
                  {versions.length === 0 && <div style={{ color: C.t4, fontFamily: M, fontSize: 11 }}>No versions yet.</div>}
                  {versions.map((v) => (
                    <div key={v.version} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.br}44` }}>
                      <div>
                        <span style={{ fontSize: 12, fontFamily: SR, color: C.t1 }}>v{v.version}</span>
                        <span style={{ fontSize: 10, fontFamily: M, color: C.t3, marginLeft: 8 }}>{new Date(v.createdAt).toLocaleString()}</span>
                        {v.changeLog && <div style={{ fontSize: 10, color: C.t3, fontFamily: F }}>{v.changeLog}</div>}
                        <div style={{ fontSize: 8.5, color: C.t4, fontFamily: M }}>{v.bodyHash.slice(0, 16)}…</div>
                      </div>
                      <button onClick={() => revert(v.version)} disabled={busy} style={{ background: "transparent", border: `1px solid ${C.tl}`, color: C.tl, fontFamily: M, fontSize: 9.5, padding: "5px 10px", borderRadius: 3, cursor: "pointer" }}>Revert to this</button>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Preview panel */}
            {preview && (
              <div style={{ borderTop: `1px solid ${C.br}`, padding: "12px 18px", background: C.bg }}>
                <div style={{ fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 }}>Preview (dry-run — nothing saved, no approval consumed)</div>
                {preview.loading && <div style={{ color: C.t3, fontFamily: M, fontSize: 11 }}>Running…</div>}
                {preview.error && <div style={{ color: C.rd, fontFamily: M, fontSize: 11 }}>{preview.error}</div>}
                {preview.rec && (
                  <div style={{ fontSize: 11, fontFamily: F, color: C.t2, lineHeight: 1.5 }}>
                    <div style={{ marginBottom: 4 }}><b style={{ color: C.t1 }}>Action:</b> {preview.rec.suggestedAction} · <b style={{ color: C.t1 }}>Confidence:</b> {Math.round((preview.rec.confidence || 0) * 100)}%</div>
                    <div style={{ whiteSpace: "pre-wrap", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 4, padding: 10, maxHeight: 180, overflow: "auto" }}>{preview.rec.draftedResponse || "(no draft)"}</div>
                  </div>
                )}
              </div>
            )}

            {/* Footer actions */}
            <div style={{ borderTop: `1px solid ${C.br}`, padding: "12px 18px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1, minWidth: 220 }}>
                <input placeholder="Sample ticket type…" value={previewTicket.type} onChange={(e) => setPreviewTicket({ ...previewTicket, type: e.target.value })} style={{ ...inputStyle, width: 150, padding: "5px 8px", fontSize: 11 }} />
                <input placeholder="Sample description…" value={previewTicket.desc} onChange={(e) => setPreviewTicket({ ...previewTicket, desc: e.target.value })} style={{ ...inputStyle, flex: 1, padding: "5px 8px", fontSize: 11 }} />
                <button onClick={runPreview} disabled={busy} style={{ background: "transparent", border: `1px solid ${C.cy}`, color: C.cy, fontFamily: M, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, padding: "6px 12px", borderRadius: 3, cursor: "pointer", whiteSpace: "nowrap" }}>▷ Preview</button>
              </div>
              <label style={{ background: "transparent", border: `1px solid ${C.br}`, color: C.t3, fontFamily: M, fontSize: 10, padding: "6px 10px", borderRadius: 3, cursor: "pointer" }}>Import<input type="file" accept="application/json" onChange={doImport} style={{ display: "none" }} /></label>
              <button onClick={doExport} style={{ background: "transparent", border: `1px solid ${C.br}`, color: C.t3, fontFamily: M, fontSize: 10, padding: "6px 10px", borderRadius: 3, cursor: "pointer" }}>Export</button>
              <button onClick={saveDraft} disabled={busy} style={{ background: "transparent", border: `1px solid ${C.tl}`, color: C.tl, fontFamily: M, fontSize: 10, fontWeight: 700, padding: "6px 14px", borderRadius: 3, cursor: "pointer" }}>Save draft</button>
              <button onClick={publish} disabled={busy} style={{ background: C.gn, border: `1px solid ${C.gn}`, color: C.bg, fontFamily: M, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, padding: "6px 16px", borderRadius: 3, cursor: "pointer" }}>Publish · goes live</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
