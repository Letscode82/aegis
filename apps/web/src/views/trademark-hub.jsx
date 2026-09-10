/**
 * Trademark tab — clearance screening + portfolio over the TrademarkMark
 * index. The screening box runs the same deterministic knock-out engine as
 * the Trademark Clearance intake agent (phonetic + visual + NICE-class
 * similarity); the portfolio lists the marks screened against and registry
 * health. A knock-out screen is preliminary — a formal registry clearance +
 * counsel sign-off is always still required.
 */
import { useState, useEffect, useCallback } from "react";
import { C, F, M, SR } from "@aegis/ui";

const STATUS = {
  clear: { label: "Clear", col: C.gn },
  conflict: { label: "Conflict", col: C.rd },
  unavailable: { label: "Unavailable", col: C.am },
};
const MARK_STATUS = {
  LIVE: C.gn, DEAD: C.t4, PENDING: C.am,
};

const badge = (col) => ({ fontSize: 10, fontWeight: 700, letterSpacing: .4, color: col, border: `1px solid ${col}`, borderRadius: 5, padding: "2px 8px", whiteSpace: "nowrap" });

export function TrademarkHub() {
  const [mark, setMark] = useState("");
  const [classes, setClasses] = useState("");
  const [screening, setScreening] = useState(false);
  const [result, setResult] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [search, setSearch] = useState("");

  const loadPortfolio = useCallback((q) => {
    const qs = q && q.trim() ? `?search=${encodeURIComponent(q.trim())}` : "";
    fetch(`/api/trademark/portfolio${qs}`)
      .then((r) => r.json())
      .then((d) => setPortfolio(d.ok ? d : { marks: [], total: 0, bySource: {}, registry: {} }))
      .catch(() => setPortfolio({ marks: [], total: 0, bySource: {}, registry: {} }));
  }, []);

  useEffect(() => { loadPortfolio(""); }, [loadPortfolio]);

  async function onScreen(e) {
    e?.preventDefault?.();
    if (!mark.trim()) return;
    setScreening(true);
    setResult(null);
    try {
      const classArr = classes.split(",").map((c) => parseInt(c.trim(), 10)).filter((n) => Number.isFinite(n));
      const r = await fetch("/api/trademark/screen", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark: mark.trim(), classes: classArr }),
      });
      const d = await r.json();
      setResult(d);
    } catch (err) {
      setResult({ status: "unavailable", note: String(err?.message || err), conflicts: [] });
    } finally {
      setScreening(false);
    }
  }

  const reg = portfolio?.registry || {};
  const st = result ? (STATUS[result.status] || STATUS.unavailable) : null;

  return (
    <div style={{ padding: "26px 32px", fontFamily: F, color: C.t1, maxWidth: 1440, margin: "0 auto" }}>
      <div style={{ marginBottom: 6, fontFamily: M, fontSize: 10.5, letterSpacing: 1.4, color: C.pp, textTransform: "uppercase" }}>Trademark · clearance &amp; portfolio</div>
      <div style={{ fontFamily: SR, fontSize: 28, fontWeight: 600, marginBottom: 4 }}>Trademark Clearance</div>
      <div style={{ fontSize: 13.5, color: C.t3, marginBottom: 22, maxWidth: "70ch" }}>
        Screen a proposed mark against the registry index for knock-out conflicts, then review the portfolio it was matched against. A preliminary screen — a formal USPTO/EUIPO/WIPO clearance and counsel sign-off is always still required.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.3fr)", gap: 18, alignItems: "start" }}>
        {/* Screening card */}
        <div style={{ background: C.s1, border: `1px solid ${C.br}`, borderRadius: 10, padding: 18 }}>
          <div style={{ fontFamily: SR, fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Screen a mark</div>
          <form onSubmit={onScreen}>
            <label style={{ fontSize: 11, fontFamily: M, color: C.t3, letterSpacing: .5, textTransform: "uppercase" }}>Word mark</label>
            <input value={mark} onChange={(e) => setMark(e.target.value)} placeholder="e.g. NORTHWIND"
              style={{ width: "100%", margin: "6px 0 14px", padding: "9px 11px", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 7, color: C.t1, fontFamily: F, fontSize: 14 }} />
            <label style={{ fontSize: 11, fontFamily: M, color: C.t3, letterSpacing: .5, textTransform: "uppercase" }}>NICE classes <span style={{ color: C.t4 }}>(optional, comma-separated 1–45)</span></label>
            <input value={classes} onChange={(e) => setClasses(e.target.value)} placeholder="e.g. 9, 42"
              style={{ width: "100%", margin: "6px 0 16px", padding: "9px 11px", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 7, color: C.t1, fontFamily: F, fontSize: 14 }} />
            <button type="submit" disabled={screening || !mark.trim()}
              style={{ padding: "10px 18px", background: C.pp, color: C.bg, border: "none", borderRadius: 8, fontFamily: F, fontSize: 13, fontWeight: 600, cursor: screening || !mark.trim() ? "default" : "pointer", opacity: screening || !mark.trim() ? .6 : 1 }}>
              {screening ? "Screening…" : "Screen mark"}
            </button>
          </form>

          {result && (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.br}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={badge(st.col)}>{st.label.toUpperCase()}</span>
                {typeof result.screened === "number" && <span style={{ fontSize: 11.5, color: C.t3, fontFamily: M }}>{result.screened} marks screened</span>}
              </div>
              <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.5, marginBottom: (result.conflicts || []).length ? 12 : 0 }}>{result.note}</div>
              {(result.conflicts || []).map((cf, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 10px", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 7, marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{cf.wordMark}</div>
                    <div style={{ fontSize: 10.5, color: C.t3, fontFamily: M, marginTop: 2 }}>
                      {(cf.basis || []).join(" · ")}{cf.classOverlap ? " · class overlap" : ""}{cf.classes?.length ? ` · cl ${cf.classes.join(",")}` : ""}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontFamily: M, fontWeight: 700, color: cf.score >= 0.8 ? C.rd : C.am }}>{Math.round((cf.score || 0) * 100)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Portfolio card */}
        <div style={{ background: C.s1, border: `1px solid ${C.br}`, borderRadius: 10, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <div style={{ fontFamily: SR, fontSize: 16, fontWeight: 600 }}>Portfolio &amp; registries</div>
            <input value={search} onChange={(e) => { setSearch(e.target.value); loadPortfolio(e.target.value); }} placeholder="Search marks…"
              style={{ width: 180, padding: "7px 10px", background: C.bg, border: `1px solid ${C.br}`, borderRadius: 7, color: C.t1, fontFamily: F, fontSize: 13 }} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 11.5, fontFamily: M, color: C.t2 }}>{portfolio?.total ?? "—"} marks indexed</span>
            {reg.configured?.length ? <span style={{ fontSize: 11.5, fontFamily: M, color: C.t3 }}>· registries: {reg.configured.join(", ")}</span> : <span style={{ fontSize: 11.5, fontFamily: M, color: C.t4 }}>· local index only</span>}
            {portfolio?.listAsOf && <span style={{ fontSize: 11.5, fontFamily: M, color: C.t4 }}>· as of {new Date(portfolio.listAsOf).toLocaleDateString()}</span>}
          </div>

          <div style={{ maxHeight: 460, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: C.t3, fontFamily: M, fontSize: 10, letterSpacing: .5, textTransform: "uppercase" }}>
                  <th style={{ padding: "6px 8px", position: "sticky", top: 0, background: C.s1 }}>Mark</th>
                  <th style={{ padding: "6px 8px", position: "sticky", top: 0, background: C.s1 }}>Classes</th>
                  <th style={{ padding: "6px 8px", position: "sticky", top: 0, background: C.s1 }}>Source</th>
                  <th style={{ padding: "6px 8px", position: "sticky", top: 0, background: C.s1 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {(portfolio?.marks || []).map((m) => (
                  <tr key={m.id} style={{ borderTop: `1px solid ${C.br}` }}>
                    <td style={{ padding: "8px" }}>
                      <div style={{ fontWeight: 600 }}>{m.wordMark}</div>
                      {m.ownerName && <div style={{ fontSize: 10.5, color: C.t4 }}>{m.ownerName}</div>}
                    </td>
                    <td style={{ padding: "8px", color: C.t2, fontFamily: M, fontSize: 11 }}>{m.niceClasses?.length ? m.niceClasses.join(", ") : "—"}</td>
                    <td style={{ padding: "8px", color: C.t3, fontFamily: M, fontSize: 11 }}>{m.source}</td>
                    <td style={{ padding: "8px" }}><span style={{ fontSize: 10, fontWeight: 700, color: MARK_STATUS[m.status] || C.t3 }}>{m.status}</span></td>
                  </tr>
                ))}
                {portfolio && portfolio.marks?.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: "20px 8px", color: C.t4, textAlign: "center" }}>No marks{search ? " match your search" : " loaded yet"}.</td></tr>
                )}
                {!portfolio && (
                  <tr><td colSpan={4} style={{ padding: "20px 8px", color: C.t4, textAlign: "center" }}>Loading…</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
