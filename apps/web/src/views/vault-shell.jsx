/**
 * Vault (V1) — project collections of documents for cross-document review +
 * cited Q&A. This is a platform surface, not a new module: it groups shared
 * Document rows (ownerType VAULT) and is powered by @aegis/search. V1a ships
 * the foundation — create a vault, file documents into it, see the collection.
 * Scoped cited Q&A (V1b) and the bulk review grid (V1c) build on this.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { C, F, M, SR } from "@aegis/ui";

function fmtBytes(n) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || "").split(",")[1] || "");
    r.onerror = () => reject(new Error("Could not read the file."));
    r.readAsDataURL(file);
  });
}

export function VaultShell() {
  const [vaults, setVaults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null); // {vault, documents}
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const [ans, setAns] = useState(null); // { answer, sources, grounded }
  const [reviewQ, setReviewQ] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [grid, setGrid] = useState(null); // { columns, rows, truncated, shownDocs, totalDocs }

  useEffect(() => { setAns(null); setQ(""); setGrid(null); setReviewQ(""); }, [selectedId]);

  const loadVaults = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch("/api/vault").then((r) => r.json());
      if (d.ok) setVaults(d.vaults || []);
      else setError(d.error || "Could not load vaults.");
    } catch {
      setError("Could not load vaults.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id) => {
    setDetail(null);
    try {
      const d = await fetch(`/api/vault/${encodeURIComponent(id)}`).then((r) => r.json());
      if (d.ok) setDetail(d);
      else setError(d.error || "Could not load the vault.");
    } catch {
      setError("Could not load the vault.");
    }
  }, []);

  useEffect(() => { loadVaults(); }, [loadVaults]);
  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId, loadDetail]);

  const createVault = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const d = await fetch("/api/vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }).then((r) => r.json());
      if (d.ok) { setNewName(""); await loadVaults(); setSelectedId(d.vault.id); }
      else setError(d.error || "Could not create the vault.");
    } catch {
      setError("Could not create the vault.");
    } finally {
      setCreating(false);
    }
  }, [newName, loadVaults]);

  const uploadFile = useCallback(async (file) => {
    if (!file || !selectedId) return;
    setUploading(true);
    setError(null);
    try {
      const contentBase64 = await readBase64(file);
      const d = await fetch(`/api/vault/${encodeURIComponent(selectedId)}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, contentBase64 }),
      }).then((r) => r.json());
      if (d.ok) { await loadDetail(selectedId); await loadVaults(); }
      else setError(d.error || "Upload failed.");
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setUploading(false);
    }
  }, [selectedId, loadDetail, loadVaults]);

  const askVault = useCallback(async () => {
    const text = q.trim();
    if (!text || !selectedId) return;
    setAsking(true);
    setAns(null);
    setError(null);
    try {
      const d = await fetch(`/api/vault/${encodeURIComponent(selectedId)}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).then((r) => r.json());
      if (d.ok) setAns({ answer: d.answer || "", sources: d.sources || [], grounded: !!d.grounded });
      else setError(d.error || "Could not answer that.");
    } catch {
      setError("Could not answer that.");
    } finally {
      setAsking(false);
    }
  }, [q, selectedId]);

  const runReview = useCallback(async () => {
    const questions = reviewQ.split("\n").map((s) => s.trim()).filter((s) => s.length >= 3).slice(0, 6);
    if (questions.length === 0 || !selectedId) return;
    setReviewing(true);
    setGrid(null);
    setError(null);
    try {
      const d = await fetch(`/api/vault/${encodeURIComponent(selectedId)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions }),
      }).then((r) => r.json());
      if (d.ok) setGrid(d);
      else setError(d.error || "Review failed.");
    } catch {
      setError("Review failed.");
    } finally {
      setReviewing(false);
    }
  }, [reviewQ, selectedId]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 18, height: "100%", fontFamily: F, color: C.t1 }}>
      {/* Left: vault list + create */}
      <div style={{ borderRight: `1px solid ${C.br}`, paddingRight: 16, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Vaults</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createVault(); }}
            placeholder="New vault name…"
            style={{ flex: 1, minWidth: 0, background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, color: C.t1, fontFamily: F, fontSize: 12.5, padding: "7px 10px", outline: "none" }}
          />
          <button type="button" onClick={createVault} disabled={creating || !newName.trim()} style={{ background: C.em, color: C.bg, border: "none", borderRadius: 8, padding: "0 12px", fontFamily: M, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer", opacity: creating || !newName.trim() ? 0.5 : 1 }}>+</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {loading ? (
            <div style={{ color: C.t4, fontFamily: M, fontSize: 11 }}>Loading…</div>
          ) : vaults.length === 0 ? (
            <div style={{ color: C.t4, fontSize: 12, lineHeight: 1.5 }}>No vaults yet. Create one to collect documents for cross-document review and cited Q&amp;A.</div>
          ) : (
            vaults.map((v) => (
              <button key={v.id} type="button" onClick={() => setSelectedId(v.id)} style={{ width: "100%", textAlign: "left", background: selectedId === v.id ? C.emG : "transparent", border: `1px solid ${selectedId === v.id ? C.em : C.br}`, borderRadius: 10, padding: "9px 11px", marginBottom: 6, cursor: "pointer" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.name}</div>
                <div style={{ fontSize: 10, fontFamily: M, color: C.t4, marginTop: 2 }}>{v.documentCount} doc{v.documentCount === 1 ? "" : "s"}</div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: selected vault */}
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {error && <div style={{ color: C.rd, fontFamily: M, fontSize: 11.5, background: C.rdG, border: `1px solid ${C.rd}44`, borderRadius: 8, padding: "8px 10px", marginBottom: 12 }}>⚠ {error}</div>}
        {!detail ? (
          <div style={{ color: C.t4, fontSize: 13, marginTop: 40, textAlign: "center" }}>
            {selectedId ? "Loading vault…" : "Select a vault, or create one, to get started."}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
              <span style={{ fontFamily: SR, fontSize: 22, color: C.t1 }}>{detail.vault.name}</span>
              <span style={{ fontSize: 10, fontFamily: M, color: C.t4 }}>{detail.documents.length} document{detail.documents.length === 1 ? "" : "s"}</span>
            </div>
            {detail.vault.description && <div style={{ fontSize: 12.5, color: C.t3, marginBottom: 12 }}>{detail.vault.description}</div>}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
              <input ref={fileRef} type="file" accept=".txt,.md,.markdown,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style={{ display: "none" }} onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) uploadFile(f); e.target.value = ""; }} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={{ background: C.em, color: C.bg, border: "none", borderRadius: 8, padding: "8px 14px", fontFamily: M, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", cursor: "pointer", opacity: uploading ? 0.6 : 1 }}>{uploading ? "Uploading…" : "📎 Add document"}</button>
              <span style={{ fontSize: 10.5, color: C.t4 }}>.txt · .md · .docx · .pdf</span>
            </div>
            {/* Ask across the vault (V1b) */}
            {detail.documents.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") askVault(); }}
                    placeholder="Ask a question across this vault…"
                    style={{ flex: 1, minWidth: 0, background: C.cd, border: `1px solid ${C.brL}`, borderRadius: 8, color: C.t1, fontFamily: F, fontSize: 13, padding: "9px 12px", outline: "none" }}
                  />
                  <button type="button" onClick={askVault} disabled={asking || !q.trim()} style={{ background: C.em, color: C.bg, border: "none", borderRadius: 8, padding: "0 14px", fontFamily: M, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", cursor: "pointer", opacity: asking || !q.trim() ? 0.5 : 1 }}>{asking ? "…" : "Ask"}</button>
                </div>
                {ans && (
                  <div style={{ marginTop: 10, border: `1px solid ${C.br}`, borderRadius: 10, background: C.cd, padding: 14 }}>
                    <div style={{ fontSize: 13.5, color: C.t1, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{ans.answer}</div>
                    {ans.sources.length > 0 && (
                      <div style={{ marginTop: 12, borderTop: `1px solid ${C.br}`, paddingTop: 10 }}>
                        <div style={{ fontSize: 9, fontFamily: M, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>Sources</div>
                        <div style={{ display: "grid", gap: 6 }}>
                          {ans.sources.map((s) => (
                            <div key={s.n} style={{ display: "flex", gap: 9, alignItems: "baseline", padding: "7px 9px", background: C.s1, border: `1px solid ${C.br}`, borderRadius: 8 }}>
                              <span style={{ fontSize: 10, fontFamily: M, color: C.em, flexShrink: 0 }}>[{s.n}]</span>
                              <span style={{ minWidth: 0, flex: 1 }}>
                                <span style={{ fontSize: 12, color: C.t1, fontWeight: 600, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                                <span style={{ fontSize: 11, color: C.t3, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.snippet}</span>
                              </span>
                              <span style={{ fontSize: 8, fontFamily: M, color: C.t4, textTransform: "uppercase", flexShrink: 0 }}>{s.retrieval === "semantic" ? "◆ sem" : "kw"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* Bulk cross-document review grid (V1c) */}
            {detail.documents.length > 0 && (
              <details style={{ marginBottom: 14, border: `1px solid ${C.br}`, borderRadius: 10, padding: "8px 12px", background: C.cd }}>
                <summary style={{ fontSize: 11, fontFamily: M, color: C.t2, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}>Bulk review · ask questions across every document</summary>
                <div style={{ marginTop: 10 }}>
                  <textarea
                    value={reviewQ}
                    onChange={(e) => setReviewQ(e.target.value)}
                    placeholder={"One question per line (up to 6), e.g.\nWhat is the governing law?\nWhat is the liability cap?\nIs there an auto-renewal clause?"}
                    rows={4}
                    style={{ width: "100%", resize: "vertical", background: C.s1, border: `1px solid ${C.br}`, borderRadius: 8, color: C.t1, fontFamily: F, fontSize: 12.5, lineHeight: 1.5, padding: "9px 11px", outline: "none", boxSizing: "border-box" }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                    <button type="button" onClick={runReview} disabled={reviewing || reviewQ.trim().length < 3} style={{ background: C.em, color: C.bg, border: "none", borderRadius: 8, padding: "8px 14px", fontFamily: M, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", cursor: "pointer", opacity: reviewing || reviewQ.trim().length < 3 ? 0.5 : 1 }}>{reviewing ? "Reviewing…" : "Run review"}</button>
                    <span style={{ fontSize: 10.5, color: C.t4 }}>{reviewing ? "Reading every document…" : "columns = questions · rows = documents"}</span>
                  </div>
                  {grid && grid.rows.length > 0 && (
                    <div style={{ marginTop: 12, overflowX: "auto" }}>
                      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11.5 }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${C.br}`, color: C.t3, fontFamily: M, fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.5, position: "sticky", left: 0, background: C.cd, minWidth: 140 }}>Document</th>
                            {grid.columns.map((c, i) => (
                              <th key={i} style={{ textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${C.br}`, color: C.t2, fontWeight: 600, minWidth: 180, verticalAlign: "top" }}>{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {grid.rows.map((row) => (
                            <tr key={row.documentId}>
                              <td style={{ padding: "7px 8px", borderBottom: `1px solid ${C.br}`, color: C.t1, fontWeight: 600, position: "sticky", left: 0, background: C.cd, verticalAlign: "top" }}>{row.name}</td>
                              {row.cells.map((cell, i) => (
                                <td key={i} style={{ padding: "7px 8px", borderBottom: `1px solid ${C.br}`, color: cell === "—" || cell === "Not addressed" ? C.t4 : C.t2, lineHeight: 1.45, verticalAlign: "top" }}>{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {grid.truncated && <div style={{ marginTop: 8, fontSize: 10.5, color: C.t4 }}>Showing {grid.shownDocs} of {grid.totalDocs} documents.</div>}
                    </div>
                  )}
                </div>
              </details>
            )}
            <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {detail.documents.length === 0 ? (
                <div style={{ color: C.t4, fontSize: 12.5, lineHeight: 1.6, border: `1px dashed ${C.br}`, borderRadius: 10, padding: 20, textAlign: "center" }}>
                  No documents yet. Add files to build the collection — then ask questions across all of them.
                </div>
              ) : (
                detail.documents.map((doc) => (
                  <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", border: `1px solid ${C.br}`, borderRadius: 8, marginBottom: 6, background: C.cd }}>
                    <span style={{ fontSize: 14 }} aria-hidden="true">📄</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.name}</span>
                    <span style={{ fontSize: 10, fontFamily: M, color: C.t4, flexShrink: 0 }}>{fmtBytes(doc.sizeBytes)}</span>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
