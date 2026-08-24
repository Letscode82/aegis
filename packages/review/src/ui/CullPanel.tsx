/**
 * CullPanel — the Cull / Process stage. Surfaces the culling levers as an
 * explicit stage between Collect and Review: email-thread suppression, near-
 * duplicates, and family rollup, with a before → after document count. Today
 * it's an insight dashboard (the suppression is applied in Review's "Suppress
 * dupes" toggle and excluded from production by coding); RC-5 turns these into
 * persisted culls with an exclusion log.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { C, F, M, SR, useToast } from "@aegis/ui";

export interface CullPanelProps { apiBase: string; reviewSetId: string; canMutate?: boolean }

type Item = { id: string; familyRole: string | null; familyId: string | null; threadId: string | null; isInclusive: boolean | null; dedupKey: string | null; excluded?: boolean };
const cbtn = (bg: string): React.CSSProperties => ({ padding: "10px 16px", background: bg, color: C.bg, border: "none", borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" });
const cghost = (col: string): React.CSSProperties => ({ padding: "10px 16px", background: "transparent", color: col, border: `1px solid ${col}`, borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: "pointer" });

const stat = (label: string, value: React.ReactNode, col: string, sub?: string) => (
  <div style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 12, padding: "18px 20px", minWidth: 150 }}>
    <div style={{ fontFamily: SR, fontSize: 30, fontWeight: 600, color: col }}>{value}</div>
    <div style={{ fontSize: 12, color: C.t2, marginTop: 4 }}>{label}</div>
    {sub && <div style={{ fontSize: 10.5, color: C.t4, fontFamily: M, marginTop: 2 }}>{sub}</div>}
  </div>
);

const JUNK_CHIPS = ["unsubscribe", "no-reply", "newsletter", "out of office", "calendar invite", "daily digest"];
const SOURCE_TYPES = ["MAILBOX", "ONEDRIVE", "TEAMS", "SHAREPOINT"];

export const CullPanel: React.FC<CullPanelProps> = ({ apiBase, reviewSetId, canMutate }) => {
  const toast = useToast();
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [kw, setKw] = useState("");
  const [srcSel, setSrcSel] = useState<string[]>([]);
  const load = useCallback(() => {
    fetch(`${apiBase}/${reviewSetId}`).then((r) => r.json()).then((d) => setItems(d.ok ? d.items : [])).catch(() => setItems([]));
  }, [apiBase, reviewSetId]);
  useEffect(() => { load(); }, [load]);

  const runCull = async (body: Record<string, unknown>, msg: (d: { total?: number; excluded?: number; restored?: number }) => string) => {
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/${reviewSetId}/cull`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error);
      toast.success(msg(d));
      load();
    } catch (e) { toast.error(String((e as Error).message || e)); } finally { setBusy(false); }
  };
  const cull = (action: "apply" | "clear") =>
    runCull({ action }, (d) => (action === "apply" ? `Culled ${d.total ?? 0} document(s)` : `Restored ${d.restored ?? 0} document(s)`));
  const toggleSrc = (s: string) => setSrcSel((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const m = useMemo(() => {
    const its = items || [];
    const kept = its.filter((i) => !i.excluded);
    const alreadyExcluded = its.length - kept.length;
    const threadSize = new Map<string, number>();
    const seen = new Set<string>();
    let dups = 0, families = 0, attachments = 0, nonInclusive = 0;
    for (const i of kept) {
      if (i.threadId) threadSize.set(i.threadId, (threadSize.get(i.threadId) ?? 0) + 1);
      if (i.familyRole === "PARENT") families += 1;
      if (i.familyRole === "ATTACHMENT") attachments += 1;
      if (i.isInclusive === false) nonInclusive += 1;
      if (i.dedupKey) { if (seen.has(i.dedupKey)) dups += 1; else seen.add(i.dedupKey); }
    }
    const threads = [...threadSize.values()].filter((n) => n > 1).length;
    const suppressible = new Set<string>();
    for (const i of kept) { if (i.isInclusive === false || (i.dedupKey && dupIsLater(kept, i))) suppressible.add(i.id); }
    const total = its.length;
    const afterCull = kept.length - suppressible.size;
    return { total, alreadyExcluded, inReview: kept.length, families, attachments, threads, nonInclusive, dups, suppressed: suppressible.size, afterCull };
  }, [items]);

  return (
    <div style={{ flex: 1, overflowY: "auto", display: "flex", justifyContent: "center", padding: "34px 28px" }}>
      <div style={{ width: 900, maxWidth: "100%" }}>
        <div style={{ fontFamily: SR, fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Cull &amp; process</div>
        <div style={{ fontSize: 13, color: C.t3, marginBottom: 20, lineHeight: 1.6 }}>Reduce the collection before review — suppress older thread messages and near-duplicates, and roll attachments up to their parent email. Reviewers then only touch what matters.</div>

        {items === null ? <div style={{ color: C.t4, fontFamily: M, fontSize: 12.5 }}>Loading…</div> : (
          <>
            {/* before → after */}
            <div style={{ display: "flex", alignItems: "center", gap: 20, background: C.cd, border: `1px solid ${C.brL}`, borderRadius: 14, padding: "22px 26px", marginBottom: 20 }}>
              <div style={{ textAlign: "center" }}><div style={{ fontFamily: SR, fontSize: 34, fontWeight: 600 }}>{m.total}</div><div style={{ fontSize: 12, color: C.t3 }}>collected</div></div>
              <div style={{ fontSize: 22, color: C.t4 }}>→</div>
              <div style={{ textAlign: "center" }}><div style={{ fontFamily: SR, fontSize: 34, fontWeight: 600, color: C.gn }}>{m.afterCull}</div><div style={{ fontSize: 12, color: C.t3 }}>after cull</div></div>
              <div style={{ marginLeft: 8, fontSize: 13, color: C.t2 }}>
                <b style={{ color: C.am }}>{m.suppressed}</b> document(s) can be suppressed
                <div style={{ fontSize: 11.5, color: C.t4, marginTop: 2 }}>{m.nonInclusive} older thread message(s) · {m.dups} near-duplicate(s)</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {stat("Email threads", m.threads, C.bl, "grouped conversations")}
              {stat("Families", m.families, C.cy, `${m.attachments} attachment(s)`)}
              {stat("Near-duplicates", m.dups, C.am, "collapse to one")}
              {stat("Thread-suppressible", m.nonInclusive, C.t3, "older messages")}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
              <button disabled={busy || !canMutate || m.suppressed === 0} onClick={() => cull("apply")} style={cbtn(C.gn)}>{busy ? "Culling…" : `Apply cull — exclude ${m.suppressed}`}</button>
              {m.alreadyExcluded > 0 && <button disabled={busy || !canMutate} onClick={() => cull("clear")} style={cghost(C.t3)}>Restore {m.alreadyExcluded} culled</button>}
              {m.alreadyExcluded > 0 && <span style={{ fontSize: 12, color: C.t3 }}><b style={{ color: C.gn }}>{m.alreadyExcluded}</b> already excluded · {m.inReview} in review</span>}
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: C.t4, fontFamily: M, lineHeight: 1.6 }}>Culled documents are excluded from review and from the production — a persisted, chain-sealed decision recorded in the exclusion log. Restore anytime.</div>

            {/* More cull passes */}
            <div style={{ marginTop: 26, borderTop: `1px solid ${C.br}`, paddingTop: 20 }}>
              <div style={{ fontFamily: SR, fontSize: 16, fontWeight: 600, marginBottom: 4 }}>More cull passes</div>
              <div style={{ fontSize: 12.5, color: C.t3, marginBottom: 16 }}>Targeted exclusions beyond dedup + threading — each reversible and chain-sealed with its own reason.</div>

              {/* Keyword / junk cull */}
              <div style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontFamily: M, letterSpacing: .5, textTransform: "uppercase", color: C.t3, marginBottom: 8 }}>Junk / keyword cull</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {JUNK_CHIPS.map((j) => (
                    <button key={j} onClick={() => setKw((v) => (v ? `${v}, ${j}` : j))} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20, cursor: "pointer", background: "transparent", color: C.t2, border: `1px solid ${C.br}` }}>+ {j}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="patterns (comma-separated) — matches subject / body" style={{ flex: 1, minWidth: 220, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 7, color: C.t1, fontFamily: F, fontSize: 12.5, padding: "8px 10px", outline: "none" }} />
                  <button disabled={busy || !canMutate || !kw.trim()} onClick={() => { runCull({ action: "keyword", patterns: kw }, (d) => `Excluded ${d.excluded ?? 0} by keyword`); }} style={cbtn(kw.trim() && canMutate ? C.am : C.br)}>Exclude matches</button>
                </div>
              </div>

              {/* Source-type cull */}
              <div style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 12, padding: "16px 18px" }}>
                <div style={{ fontSize: 11, fontFamily: M, letterSpacing: .5, textTransform: "uppercase", color: C.t3, marginBottom: 10 }}>Source-type cull</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {SOURCE_TYPES.map((s) => {
                    const on = srcSel.includes(s);
                    return (
                      <button key={s} onClick={() => toggleSrc(s)} style={{ fontSize: 11.5, fontWeight: 600, padding: "6px 12px", borderRadius: 7, cursor: "pointer", background: on ? `${C.bl}22` : "transparent", color: on ? C.bl : C.t3, border: `1px solid ${on ? C.bl : C.br}` }}>{on ? "✓ " : ""}{s}</button>
                    );
                  })}
                  <button disabled={busy || !canMutate || srcSel.length === 0} onClick={() => { runCull({ action: "source", sourceTypes: srcSel }, (d) => `Excluded ${d.excluded ?? 0} by source`); setSrcSel([]); }} style={{ ...cbtn(srcSel.length && canMutate ? C.bl : C.br), marginLeft: "auto" }}>Exclude selected source(s)</button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/** A dedupKey occurrence is "later" (suppressible) if an earlier item shares it. */
function dupIsLater(items: Item[], it: Item): boolean {
  if (!it.dedupKey) return false;
  const first = items.find((x) => x.dedupKey === it.dedupKey);
  return !!first && first.id !== it.id;
}
