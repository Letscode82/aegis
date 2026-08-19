/**
 * BatchPanel — review batching + assignment + second-level QC (shared reviewer
 * step). Split a set into batches, assign a first-pass reviewer, submit for QC,
 * and approve/reject each item in the QC queue. Chain-sealed server-side.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { C, F, M, SR, useToast } from "@aegis/ui";

export interface BatchPanelProps { apiBase: string; reviewSetId: string; canMutate: boolean }

type Batch = { id: string; name: string; status: string; assignedToUserId: string | null; itemCount: number; codedCount: number; qcPending: number; qcApproved: number; qcRejected: number };
type Item = { id: string; title: string; sourceSystem: string; qcStatus: string | null; batchId: string | null };

const btn = (bg: string): React.CSSProperties => ({ padding: "8px 13px", background: bg, color: C.bg, border: "none", borderRadius: 7, fontFamily: F, fontSize: 12.5, fontWeight: 600, cursor: "pointer" });
const ghost = (col: string): React.CSSProperties => ({ padding: "6px 11px", background: "transparent", color: col, border: `1px solid ${col}`, borderRadius: 6, fontFamily: F, fontSize: 11.5, fontWeight: 600, cursor: "pointer" });
const input: React.CSSProperties = { background: C.bg, border: `1px solid ${C.br}`, borderRadius: 7, color: C.t1, fontFamily: F, fontSize: 13, padding: "8px 10px", outline: "none", boxSizing: "border-box" };

export const BatchPanel: React.FC<BatchPanelProps> = ({ apiBase, reviewSetId, canMutate }) => {
  const toast = useToast();
  const root = useMemo(() => apiBase.replace(/\/sets$/, ""), [apiBase]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState("Batch 1");
  const [autoSize, setAutoSize] = useState(25);
  const [assignee, setAssignee] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`${apiBase}/${reviewSetId}/batches`).then((r) => r.json()).then((d) => { if (d.ok) setBatches(d.batches); }).catch(() => {});
    fetch(`${apiBase}/${reviewSetId}`).then((r) => r.json()).then((d) => { if (d.ok) setItems(d.items); }).catch(() => {});
  }, [apiBase, reviewSetId]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/${reviewSetId}/batches`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, autoSize, assignedToUserId: assignee.trim() || null }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error);
      toast.success(`Batch “${d.batch.name}” created (${d.batch.itemCount} items)`);
      setName(`Batch ${batches.length + 2}`); load();
    } catch (e) { toast.error(String((e as Error).message || e)); } finally { setBusy(false); }
  };
  const act = async (batchId: string, action: string, extra?: Record<string, unknown>) => {
    try {
      const r = await fetch(`${root}/batches/${batchId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error);
      load();
    } catch (e) { toast.error(String((e as Error).message || e)); }
  };
  const qc = async (itemId: string, approve: boolean) => {
    try {
      const r = await fetch(`${root}/items/${itemId}/qc`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approve }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error);
      setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, qcStatus: approve ? "QC_APPROVED" : "QC_REJECTED" } : it)));
      load();
    } catch (e) { toast.error(String((e as Error).message || e)); }
  };

  const qcQueue = items.filter((i) => i.qcStatus === "PENDING_QC");
  const unbatched = items.filter((i) => !i.batchId).length;

  return (
    <div style={{ flex: 1, overflowY: "auto", display: "flex", justifyContent: "center", padding: "30px 28px" }}>
      <div style={{ width: 820, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Create */}
        <div style={{ background: C.cd, border: `1px solid ${C.brL}`, borderRadius: 12, padding: "18px 20px" }}>
          <div style={{ fontFamily: SR, fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Create a review batch</div>
          <div style={{ fontSize: 12.5, color: C.t3, marginBottom: 14 }}>Assign a slice of the set to a first-pass reviewer. {unbatched} document(s) are not yet in a batch.</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Batch name" style={{ ...input, width: 180 }} />
            <label style={{ fontSize: 12, color: C.t3, display: "flex", alignItems: "center", gap: 6 }}>Size <input type="number" value={autoSize} min={1} onChange={(e) => setAutoSize(Math.max(1, Number(e.target.value) || 1))} style={{ ...input, width: 70 }} /></label>
            <input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Assignee user id (optional)" style={{ ...input, width: 220, fontFamily: M, fontSize: 11.5 }} />
            <button disabled={busy || !canMutate} onClick={create} style={btn(C.bl)}>{busy ? "…" : "Create batch"}</button>
          </div>
        </div>

        {/* Batches */}
        <div>
          <div style={{ fontSize: 11, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3, marginBottom: 8 }}>Batches ({batches.length})</div>
          {batches.length === 0 && <div style={{ fontSize: 12.5, color: C.t4, fontFamily: M }}>No batches yet.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {batches.map((b) => (
              <div key={b.id} style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 10, padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{b.name} <span style={{ fontFamily: M, fontSize: 10.5, color: statusColor(b.status), border: `1px solid ${statusColor(b.status)}`, borderRadius: 4, padding: "1px 6px", marginLeft: 6 }}>{b.status}</span></div>
                    <div style={{ fontSize: 11.5, color: C.t3, marginTop: 3 }}>{b.codedCount}/{b.itemCount} coded · QC {b.qcApproved}✓ {b.qcRejected}✕ {b.qcPending}⧗{b.assignedToUserId ? <> · <span style={{ fontFamily: M }}>assignee {b.assignedToUserId.slice(0, 8)}…</span></> : " · unassigned"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {canMutate && (b.status === "ASSIGNED" || b.status === "IN_REVIEW" || b.status === "DRAFT") && <button onClick={() => act(b.id, "submit-qc")} style={ghost(C.am)}>Submit for QC</button>}
                    {canMutate && b.status === "QC" && b.qcPending === 0 && <button onClick={() => act(b.id, "complete")} style={ghost(C.gn)}>Complete</button>}
                  </div>
                </div>
                <div style={{ height: 6, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 5, marginTop: 10, overflow: "hidden" }}>
                  <div style={{ width: `${b.itemCount ? (b.codedCount / b.itemCount) * 100 : 0}%`, height: "100%", background: C.bl }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* QC queue */}
        {qcQueue.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.am, marginBottom: 8 }}>QC queue ({qcQueue.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {qcQueue.map((it) => (
                <div key={it.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: C.cd, border: `1px solid ${C.br}`, borderRadius: 9, padding: "10px 14px" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.title}</div>
                    <div style={{ fontSize: 11, color: C.t4 }}>{it.sourceSystem}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flex: "none" }}>
                    <button disabled={!canMutate} onClick={() => qc(it.id, true)} style={ghost(C.gn)}>Approve</button>
                    <button disabled={!canMutate} onClick={() => qc(it.id, false)} style={ghost(C.rd)}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function statusColor(s: string): string {
  return s === "COMPLETE" ? C.gn : s === "QC" ? C.am : s === "ASSIGNED" || s === "IN_REVIEW" ? C.bl : C.t4;
}
