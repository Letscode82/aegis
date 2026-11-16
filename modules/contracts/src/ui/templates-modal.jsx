import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";
import { resolveTemplateFields } from "../internal/template-vars";

const FIELD_TYPES = ["text", "textarea", "date", "number", "currency", "email", "select"];

// ── Template store (Templates DB) ────────────────────────────────────
//
// The editable NDA / contract / notice drafts the agents draft from.
// Read for everyone with contracts:read_all; admins (contracts:approve)
// edit inline. Every save/delete is chain-sealed server-side. Opened from
// the Contracts repository "📄 Templates" button — one home with the
// clause-library Playbook.

const KIND_COLOR = { NDA: C.tl, CONTRACT: C.bl, NOTICE: C.am, OTHER: C.t3 };
const KINDS = ["NDA", "CONTRACT", "NOTICE", "OTHER"];
const input = { width: "100%", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 4, color: C.t1, fontFamily: F, fontSize: 11, padding: "6px 8px", outline: "none", boxSizing: "border-box" };
const mono = { ...input, fontFamily: M, fontSize: 10.5, lineHeight: 1.5 };
const lbl = { fontSize: 8.5, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3, marginBottom: 2 };
const btn = (bg, fg) => ({ padding: "5px 11px", background: bg, color: fg || C.bg, border: "none", borderRadius: 4, fontFamily: M, fontSize: 9.5, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase", cursor: "pointer" });
const ghost = (col) => ({ padding: "5px 11px", background: "transparent", color: col, border: `1px solid ${col}`, borderRadius: 4, fontFamily: M, fontSize: 9.5, letterSpacing: 1, fontWeight: 600, textTransform: "uppercase", cursor: "pointer" });

const empty = () => ({ kind: "NDA", key: "", name: "", body: "", description: "", fieldSchema: [] });

export function TemplatesModal({ canManage, onClose }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // template id or "new" or null
  const [form, setForm] = useState(empty());
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [aiInstr, setAiInstr] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiGrounded, setAiGrounded] = useState(false); // opt-in: live web-search grounding (needs Vercel Pro)
  const [aiMeta, setAiMeta] = useState(null); // { grounded, sources[], degradedReason, searchError, skeleton }
  const [seedBusy, setSeedBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const seedSamples = async () => {
    setSeedBusy(true); setError(null); setNotice(null);
    try {
      const r = await fetch("/api/contracts/seed-templates", { method: "POST" });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setNotice(`Seeded ${d.seeded} sample template${d.seeded === 1 ? "" : "s"} (${(d.templates || []).map((t) => t.name).join(", ")}).`);
      load();
    } catch (e) { setError(String(e.message || e)); } finally { setSeedBusy(false); }
  };

  const generate = async () => {
    setAiBusy(true); setError(null); setAiMeta(null);
    // Never let the spinner hang: abort after 3 min (grounded drafting can run
    // 1–2 min; beyond that the deploy's function time limit is the real cap).
    // The server never errors on timeout — it returns a structured skeleton —
    // so this abort only guards a stuck network, not a slow model.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 180000);
    try {
      const r = await fetch("/api/contracts/templates/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: form.kind, name: form.name, instructions: aiInstr, grounded: aiGrounded }),
        signal: ctrl.signal,
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setForm((f) => ({ ...f, body: d.body }));
      setAiMeta({ grounded: !!d.grounded, sources: Array.isArray(d.sources) ? d.sources : [], degradedReason: d.degradedReason || null, searchError: d.searchError || null, skeleton: !!d.skeleton });
    } catch (e) {
      setError(e.name === "AbortError"
        ? "The draft request was taking too long and was cancelled. Turn off grounding for a fast draft, shorten the brief, or try again — you'll always get at least a structured skeleton to edit."
        : String(e.message || e));
    } finally { clearTimeout(timer); setAiBusy(false); }
  };

  const load = useCallback(() => {
    fetch(`/api/contracts/templates${canManage ? "?all=1" : ""}`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || `HTTP ${r.status}`))))
      .then((d) => setRows(d.templates || []))
      .catch((e) => setError(String(e)));
  }, [canManage]);
  useEffect(() => { load(); }, [load]);

  const startEdit = (t) => { setEditing(t.id); setForm({ ...t, description: t.description || "", fieldSchema: Array.isArray(t.fieldSchema) ? t.fieldSchema : [] }); };
  const startNew = () => { setEditing("new"); setForm(empty()); };

  // ── Guided-fill field schema editing ───────────────────────────────
  const detectFields = () => setForm((f) => {
    const existing = Object.fromEntries((f.fieldSchema || []).map((d) => [d.token, d]));
    const next = resolveTemplateFields(f.body || "", f.fieldSchema || [])
      .map((r) => existing[r.token] || { token: r.token, type: r.type, required: r.required });
    return { ...f, fieldSchema: next };
  });
  const updField = (i, patch) => setForm((f) => ({ ...f, fieldSchema: (f.fieldSchema || []).map((d, idx) => (idx === i ? { ...d, ...patch } : d)) }));
  const removeField = (i) => setForm((f) => ({ ...f, fieldSchema: (f.fieldSchema || []).filter((_, idx) => idx !== i) }));

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/contracts/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setEditing(null); load();
    } catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };
  const del = async (id) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/contracts/templates", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      load();
    } catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };
  const upd = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(4,7,15,.72)", zIndex: 1100, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "5vh 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ fontFamily: F, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 8, width: "min(820px, 100%)" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.br}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, fontFamily: M, letterSpacing: 2, color: C.bl, textTransform: "uppercase" }}>Draft Templates</div>
            <div style={{ fontSize: 17, fontFamily: SR, color: C.t1 }}>Template store</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {canManage && editing === null && <button disabled={seedBusy} onClick={seedSamples} title="Add the built-in MSA + mutual-NDA templates (idempotent)" style={{ ...ghost(C.tl), opacity: seedBusy ? .6 : 1 }}>{seedBusy ? "Seeding…" : "⤵ Seed samples"}</button>}
            {canManage && editing === null && <button onClick={startNew} style={btn(C.cy)}>+ Template</button>}
            <div onClick={onClose} style={{ cursor: "pointer", fontSize: 10, fontFamily: M, color: C.t3, letterSpacing: 1, alignSelf: "center" }}>✕ CLOSE</div>
          </div>
        </div>

        <div style={{ padding: "14px 18px" }}>
          {error && <div style={{ color: C.rd, fontFamily: M, fontSize: 11, marginBottom: 10 }}>⚠ {error}</div>}
          {notice && <div style={{ color: C.gn, fontFamily: M, fontSize: 11, marginBottom: 10 }}>✓ {notice}</div>}
          <div style={{ fontSize: 10, color: C.t4, fontFamily: M, marginBottom: 12 }}>Use <b style={{ color: C.t3 }}>{"{{variable}}"}</b> placeholders (e.g. {"{{counterparty}}"}, {"{{term}}"}) — the agents fill them when drafting.</div>

          {editing !== null && (
            <div style={{ padding: "12px 14px", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 6, marginBottom: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div><div style={lbl}>Kind</div><select value={form.kind} onChange={upd("kind")} style={input}>{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
                <div><div style={lbl}>Key (stable)</div><input value={form.key} onChange={upd("key")} disabled={editing !== "new"} placeholder="mnda-v4.2" style={input} /></div>
                <div><div style={lbl}>Name</div><input value={form.name} onChange={upd("name")} placeholder="Standard Mutual NDA" style={input} /></div>
              </div>
              <div style={{ marginBottom: 8 }}><div style={lbl}>Description</div><input value={form.description} onChange={upd("description")} style={input} /></div>
              {canManage && (
                <div style={{ marginBottom: 8, padding: "9px 11px", background: C.s1, borderRadius: 5, border: `1px solid ${C.pp}44` }}>
                  <div style={{ ...lbl, color: C.pp }}>✨ Draft with AI</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input value={aiInstr} onChange={(e) => setAiInstr(e.target.value)} placeholder="e.g. mutual NDA, 3-year term, California law, no residuals clause" style={{ ...input, flex: 1 }} />
                    <button disabled={aiBusy} onClick={generate} style={{ padding: "6px 12px", background: C.pp, color: C.bg, border: "none", borderRadius: 4, fontFamily: M, fontSize: 9.5, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap", opacity: aiBusy ? .6 : 1 }}>{aiBusy ? "Drafting…" : "Generate"}</button>
                  </div>
                  <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, cursor: "pointer" }}>
                    <input type="checkbox" checked={aiGrounded} onChange={(e) => setAiGrounded(e.target.checked)} disabled={aiBusy} />
                    <span style={{ fontSize: 9, fontFamily: M, color: C.t3 }}>Ground in <b style={{ color: C.t2 }}>live official sources</b> &amp; cite them (slower — needs Vercel Pro's higher time limit; otherwise it falls back to a fast draft or skeleton)</span>
                  </label>
                  <div style={{ fontSize: 9, color: C.t4, fontFamily: M, marginTop: 4 }}>{aiGrounded ? <>Searches the <b style={{ color: C.t3 }}>current official sources</b> and cites them.</> : <>Drafts a fast standard version — tick the box above to ground it in live sources.</>} Review and edit before saving — nothing is saved until you click Save. You'll always get at least a structured skeleton.</div>
                  {aiMeta && (
                    <div style={{ marginTop: 7, paddingTop: 7, borderTop: `1px solid ${C.br}` }}>
                      {aiMeta.skeleton ? (
                        <div style={{ fontSize: 9, fontFamily: M, color: C.am, letterSpacing: 0.5, textTransform: "uppercase" }}>⚠ Structured skeleton — AI didn't finish in time; fill the placeholders &amp; have a lawyer confirm</div>
                      ) : aiMeta.grounded ? (
                        <div style={{ fontSize: 9, fontFamily: M, color: C.gn, letterSpacing: 0.5, textTransform: "uppercase" }}>✓ Grounded in {aiMeta.sources.length} official source{aiMeta.sources.length === 1 ? "" : "s"}{aiMeta.searchError ? " (partial)" : ""}</div>
                      ) : (
                        <div style={{ fontSize: 9, fontFamily: M, color: C.am, letterSpacing: 0.5, textTransform: "uppercase" }}>⚠ Not verified against official sources — lawyer must confirm</div>
                      )}
                      {aiMeta.degradedReason && <div style={{ fontSize: 9, fontFamily: M, color: C.t4, marginTop: 3 }}>{aiMeta.degradedReason}</div>}
                      {aiMeta.sources.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 5 }}>
                          {aiMeta.sources.slice(0, 8).map((s, i) => (
                            <a key={s.url || i} href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: C.bl, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.url}>[{i + 1}] {s.title || s.url}</a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div style={{ marginBottom: 10 }}><div style={lbl}>Body (markdown / text with {"{{variables}}"})</div><textarea value={form.body} onChange={upd("body")} rows={8} style={{ ...mono, resize: "vertical" }} /></div>

              {/* Guided-fill field schema (per-template) — type / required / options / help / group / conditional */}
              {canManage && (
                <div style={{ marginBottom: 10, padding: "9px 11px", background: C.s1, borderRadius: 5, border: `1px solid ${C.br}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ ...lbl, marginBottom: 0 }}>Guided-fill fields {(form.fieldSchema || []).length > 0 && <span style={{ color: C.bl }}>· {(form.fieldSchema || []).length}</span>}</div>
                    <button type="button" onClick={detectFields} title="Scan the body for {{placeholders}} and seed field definitions (keeps your overrides)" style={{ ...ghost(C.bl), marginLeft: "auto", padding: "3px 8px", fontSize: 8.5 }}>⟳ Detect from body</button>
                  </div>
                  {(form.fieldSchema || []).length === 0 ? (
                    <div style={{ fontSize: 9.5, color: C.t4, fontFamily: M, lineHeight: 1.5 }}>No field schema yet — the author form infers types from placeholder names. Click <b style={{ color: C.t3 }}>Detect from body</b> to define types, required, dropdown options, help text, grouping and conditional show/hide per field.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
                      {(form.fieldSchema || []).map((d, i) => (
                        <div key={d.token} style={{ padding: "6px 8px", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 4 }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <span title={`{{${d.token}}}`} style={{ fontSize: 8.5, fontFamily: M, color: C.t4, border: `1px solid ${C.br}`, borderRadius: 3, padding: "1px 5px", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.token}</span>
                            <input value={d.label || ""} onChange={(e) => updField(i, { label: e.target.value })} placeholder="Label" style={{ ...input, flex: 1, minWidth: 90, padding: "4px 6px", fontSize: 10 }} />
                            <select value={d.type || "text"} onChange={(e) => updField(i, { type: e.target.value })} style={{ ...input, width: "auto", padding: "4px 6px", fontSize: 9.5 }}>{FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                            <label style={{ display: "flex", gap: 3, alignItems: "center", fontSize: 9, fontFamily: M, color: C.t3 }}><input type="checkbox" checked={d.required !== false} onChange={(e) => updField(i, { required: e.target.checked })} /> req</label>
                            <span onClick={() => removeField(i)} style={{ cursor: "pointer", fontSize: 10, color: C.rd }}>✕</span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginTop: 5 }}>
                            <input value={d.group || ""} onChange={(e) => updField(i, { group: e.target.value })} placeholder="Group (e.g. Parties)" style={{ ...input, padding: "4px 6px", fontSize: 9.5 }} />
                            <input value={d.help || ""} onChange={(e) => updField(i, { help: e.target.value })} placeholder="Help text" style={{ ...input, padding: "4px 6px", fontSize: 9.5 }} />
                          </div>
                          {d.type === "select" && (
                            <input value={(d.options || []).join(", ")} onChange={(e) => updField(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })} placeholder="Dropdown options, comma-separated" style={{ ...input, padding: "4px 6px", fontSize: 9.5, marginTop: 5 }} />
                          )}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginTop: 5 }}>
                            <input value={d.showIf?.token || ""} onChange={(e) => updField(i, { showIf: e.target.value.trim() ? { ...(d.showIf || {}), token: e.target.value.trim() } : undefined })} placeholder="Show if field…" style={{ ...input, padding: "4px 6px", fontSize: 9.5 }} />
                            <input value={d.showIf?.equals || ""} onChange={(e) => updField(i, { showIf: d.showIf?.token ? { ...d.showIf, equals: e.target.value } : (d.showIf || undefined) })} placeholder="equals…" disabled={!d.showIf?.token} style={{ ...input, padding: "4px 6px", fontSize: 9.5, opacity: d.showIf?.token ? 1 : .5 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button disabled={busy || !form.key.trim() || !form.name.trim() || !form.body.trim()} onClick={save} style={btn(C.gn)}>{busy ? "…" : "Save"}</button>
                <button onClick={() => setEditing(null)} style={ghost(C.t3)}>Cancel</button>
              </div>
            </div>
          )}

          {!rows ? <div style={{ fontSize: 11, color: C.t4, fontFamily: M }}>Loading…</div>
            : rows.length === 0 ? <div style={{ fontSize: 11, color: C.t4, fontStyle: "italic" }}>No templates yet.</div>
            : rows.map((t) => (
              <div key={t.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.br}22`, opacity: t.active ? 1 : .5 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 8.5, fontFamily: M, letterSpacing: .5, padding: "1px 6px", borderRadius: 3, color: KIND_COLOR[t.kind], border: `1px solid ${KIND_COLOR[t.kind]}55` }}>{t.kind}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: C.t1 }}>{t.name}</span>
                  <span style={{ fontSize: 9, fontFamily: M, color: C.t4 }}>{t.key} · v{t.version}</span>
                  <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    <span onClick={() => setExpanded(expanded === t.id ? null : t.id)} style={{ cursor: "pointer", fontSize: 9, fontFamily: M, color: C.t3, letterSpacing: .5, textTransform: "uppercase" }}>{expanded === t.id ? "Hide" : "View"}</span>
                    {canManage && <span onClick={() => startEdit(t)} style={{ cursor: "pointer", fontSize: 9, fontFamily: M, color: C.bl, letterSpacing: .5, textTransform: "uppercase" }}>Edit</span>}
                    {canManage && <span onClick={() => del(t.id)} style={{ cursor: "pointer", fontSize: 9, fontFamily: M, color: C.rd, letterSpacing: .5, textTransform: "uppercase" }}>Delete</span>}
                  </span>
                </div>
                {t.description && <div style={{ fontSize: 10, color: C.t3, marginTop: 3 }}>{t.description}</div>}
                {expanded === t.id && <pre style={{ marginTop: 8, padding: "10px 12px", background: C.s1, borderRadius: 5, fontSize: 10, fontFamily: M, color: C.t2, whiteSpace: "pre-wrap", lineHeight: 1.5, maxHeight: 260, overflow: "auto" }}>{t.body}</pre>}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
