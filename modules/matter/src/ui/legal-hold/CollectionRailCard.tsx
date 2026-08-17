/**
 * CollectionRailCard — Hold → eDiscovery collection. Turns the hold's
 * custodians into a scoped Purview content collection: an attorney types a
 * plain-language ask, the deterministic drafter proposes a KeyQL query (scoped
 * to custodian participants) that they edit, then Preview shows candidate hit
 * counts by source. Preview-only for now (no review-set persistence).
 */
import React, { useEffect, useState } from "react";
import { Card, SH, C, F, M, useToast } from "@aegis/ui";

export interface CollectionRailCardProps {
  matterId: string;
  holdId: string;
  canMutate: boolean;
}

type Bucket = { sourceType: string; total: number; samples: string[] };
type Preview = { queryString: string; total: number; bySource: Bucket[]; custodianCount: number; simulated: boolean };

const SOURCE_LABEL: Record<string, string> = { MAILBOX: "Mailbox", ONEDRIVE: "OneDrive", TEAMS: "Teams", SHAREPOINT: "SharePoint" };
const SOURCES = ["MAILBOX", "ONEDRIVE", "TEAMS", "SHAREPOINT"];

const btn = (bg: string): React.CSSProperties => ({ padding: "5px 11px", background: bg, color: C.bg, border: "none", borderRadius: 5, fontFamily: M, fontSize: 9.5, letterSpacing: .8, fontWeight: 700, textTransform: "uppercase", cursor: "pointer" });
const ghost = (col: string): React.CSSProperties => ({ padding: "5px 11px", background: "transparent", color: col, border: `1px solid ${col}`, borderRadius: 5, fontFamily: M, fontSize: 9.5, letterSpacing: .8, fontWeight: 600, textTransform: "uppercase", cursor: "pointer" });
const inputS: React.CSSProperties = { width: "100%", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, color: C.t1, fontFamily: F, fontSize: 12, padding: "6px 8px", outline: "none", boxSizing: "border-box" };

export const CollectionRailCard: React.FC<CollectionRailCardProps> = ({ matterId, holdId, canMutate }) => {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [nl, setNl] = useState("");
  const [kql, setKql] = useState("");
  const [sources, setSources] = useState<Record<string, boolean>>({ MAILBOX: true, ONEDRIVE: true, TEAMS: true, SHAREPOINT: false });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [sets, setSets] = useState<Array<{ id: string; name: string; itemCount: number; status: string }>>([]);
  const selected = SOURCES.filter((s) => sources[s]);

  const loadSets = () => {
    fetch(`/api/matter/${matterId}/holds/${holdId}/collection`).then((r) => r.json()).then((d) => { if (d.ok) setSets(d.reviewSets); }).catch(() => {});
  };
  useEffect(() => { if (open) loadSets(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch(`/api/matter/${matterId}/holds/${holdId}/collection`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok || d.ok === false) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
  };
  const draft = async () => {
    if (!nl.trim()) return;
    setBusy(true);
    try { const d = await post({ draft: true, naturalLanguage: nl }); setKql(d.queryString); toast.info(`Drafted for ${d.custodianCount} custodian(s)`); }
    catch (e) { toast.error(String((e as Error).message || e)); } finally { setBusy(false); }
  };
  const runPreview = async () => {
    setBusy(true); setPreview(null);
    try { const d = await post({ preview: true, queryString: kql.trim() || undefined, naturalLanguage: nl, sources: selected }); setPreview(d.preview); if (!kql.trim()) setKql(d.preview.queryString); }
    catch (e) { toast.error(String((e as Error).message || e)); } finally { setBusy(false); }
  };
  const commit = async () => {
    setBusy(true);
    try { const d = await post({ commit: true, queryString: kql.trim() || undefined, naturalLanguage: nl, sources: selected }); toast.success(`Committed ${d.reviewSet.itemCount} item(s) to "${d.reviewSet.name}"`); setPreview(null); loadSets(); }
    catch (e) { toast.error(String((e as Error).message || e)); } finally { setBusy(false); }
  };

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
        <SH icon="⚡" title="Collection" sub="Custodian-scoped Purview search" />
        <span style={{ fontFamily: M, fontSize: 10, color: C.cy }}>{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div style={{ marginTop: 10 }}>
          {!canMutate && <div style={{ fontSize: 10.5, color: C.t4, fontFamily: M, marginBottom: 6 }}>Read-only — you lack legal-hold issue rights.</div>}
          <div style={{ fontSize: 9, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.pp, marginBottom: 3 }}>Natural language → KeyQL</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input value={nl} onChange={(e) => setNl(e.target.value)} disabled={!canMutate} placeholder='invoices mentioning "vendorx" since Jan 2026' style={{ ...inputS, flex: 1 }} />
            <button disabled={busy || !canMutate || !nl.trim()} onClick={draft} style={btn(C.pp)}>Draft</button>
          </div>
          <textarea value={kql} onChange={(e) => setKql(e.target.value)} disabled={!canMutate} rows={2} placeholder="KeyQL — leave blank to scope by custodians only" style={{ ...inputS, resize: "vertical", fontFamily: M, fontSize: 11, marginBottom: 6 }} />
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
            {SOURCES.map((s) => <button key={s} disabled={!canMutate} onClick={() => setSources((p) => ({ ...p, [s]: !p[s] }))} style={sources[s] ? btn(C.tl) : ghost(C.t3)}>{SOURCE_LABEL[s]}</button>)}
          </div>
          <button disabled={busy || !canMutate || selected.length === 0} onClick={runPreview} style={ghost(C.bl)}>{busy ? "Searching…" : "Preview collection"}</button>
          {preview && (
            <div style={{ marginTop: 8, padding: "8px 10px", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 6 }}>
              <div style={{ fontSize: 10.5, fontFamily: M, color: C.t2 }}>{preview.total} hit(s) · {preview.custodianCount} custodian(s){preview.simulated ? " · simulated" : ""}</div>
              {preview.bySource.map((b) => (
                <div key={b.sourceType} style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 10.5, color: C.t1 }}><b>{SOURCE_LABEL[b.sourceType] || b.sourceType}</b> — {b.total}</div>
                  {b.samples.map((s, i) => <div key={i} style={{ fontSize: 9.5, color: C.t4, fontFamily: M, paddingLeft: 8 }}>· {s}</div>)}
                </div>
              ))}
              <div style={{ fontSize: 9, color: C.t4, fontFamily: M, marginTop: 6 }}>Query: <span style={{ color: C.t3 }}>{preview.queryString}</span></div>
              {preview.total > 0 && <button disabled={busy || !canMutate} onClick={commit} style={{ ...btn(C.gn), marginTop: 8 }}>Commit {preview.total} to review set →</button>}
            </div>
          )}
          {sets.length > 0 && (
            <div style={{ marginTop: 10, borderTop: `1px solid ${C.br}`, paddingTop: 8 }}>
              <div style={{ fontSize: 9, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3, marginBottom: 4 }}>Review sets</div>
              {sets.map((s) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.t2, padding: "3px 0" }}>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                  <span style={{ fontFamily: M, color: C.t3, flexShrink: 0, marginLeft: 8 }}>{s.itemCount} · {s.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
