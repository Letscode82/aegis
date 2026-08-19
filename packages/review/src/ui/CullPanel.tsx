/**
 * CullPanel — the Cull / Process stage. Surfaces the culling levers as an
 * explicit stage between Collect and Review: email-thread suppression, near-
 * duplicates, and family rollup, with a before → after document count. Today
 * it's an insight dashboard (the suppression is applied in Review's "Suppress
 * dupes" toggle and excluded from production by coding); RC-5 turns these into
 * persisted culls with an exclusion log.
 */
import React, { useEffect, useMemo, useState } from "react";
import { C, F, M, SR } from "@aegis/ui";

export interface CullPanelProps { apiBase: string; reviewSetId: string }

type Item = { id: string; familyRole: string | null; familyId: string | null; threadId: string | null; isInclusive: boolean | null; dedupKey: string | null };

const stat = (label: string, value: React.ReactNode, col: string, sub?: string) => (
  <div style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 12, padding: "18px 20px", minWidth: 150 }}>
    <div style={{ fontFamily: SR, fontSize: 30, fontWeight: 600, color: col }}>{value}</div>
    <div style={{ fontSize: 12, color: C.t2, marginTop: 4 }}>{label}</div>
    {sub && <div style={{ fontSize: 10.5, color: C.t4, fontFamily: M, marginTop: 2 }}>{sub}</div>}
  </div>
);

export const CullPanel: React.FC<CullPanelProps> = ({ apiBase, reviewSetId }) => {
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => {
    fetch(`${apiBase}/${reviewSetId}`).then((r) => r.json()).then((d) => setItems(d.ok ? d.items : [])).catch(() => setItems([]));
  }, [apiBase, reviewSetId]);

  const m = useMemo(() => {
    const its = items || [];
    const threadSize = new Map<string, number>();
    const seen = new Set<string>();
    let dups = 0, families = 0, attachments = 0, nonInclusive = 0;
    for (const i of its) {
      if (i.threadId) threadSize.set(i.threadId, (threadSize.get(i.threadId) ?? 0) + 1);
      if (i.familyRole === "PARENT") families += 1;
      if (i.familyRole === "ATTACHMENT") attachments += 1;
      if (i.isInclusive === false) nonInclusive += 1;
      if (i.dedupKey) { if (seen.has(i.dedupKey)) dups += 1; else seen.add(i.dedupKey); }
    }
    const threads = [...threadSize.values()].filter((n) => n > 1).length;
    const suppressible = new Set<string>();
    for (const i of its) { if (i.isInclusive === false || (i.dedupKey && dupIsLater(its, i))) suppressible.add(i.id); }
    const total = its.length;
    const afterCull = total - suppressible.size;
    return { total, families, attachments, threads, nonInclusive, dups, suppressed: suppressible.size, afterCull };
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

            <div style={{ marginTop: 20, fontSize: 12, color: C.t4, fontFamily: M, lineHeight: 1.6 }}>Suppression is applied in the Review stage (the “Suppress dupes” toggle) and excluded from production by coding. Persisted culls with an exclusion log land in a follow-up.</div>
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
