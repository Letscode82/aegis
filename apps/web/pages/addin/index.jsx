import { useEffect, useRef, useState } from "react";
import Head from "next/head";
import Script from "next/script";
import { C, F, M, SR } from "@aegis/ui";

// ── ONE Legal — Word add-in task pane (PR E) ──────────────────────────
//
// The Review + Negotiate verbs inside Word. Office.js reads the document (or
// the current selection), posts the text to /api/addin/review for a
// playbook-graded redline list, and each suggestion inserts back into the
// document as tracked-change-ready text. A single clause can also be rewritten
// per a plain-language instruction via /api/addin/redline.
//
// Governance holds: nothing persists to ONE Legal from here — the human
// accepting the tracked change in Word is the gate, exactly as redlineClause
// intends. The authoritative, chain-sealed review runs against a persisted
// Contract (PR C) in the app.

const GRADE = {
  FALLBACK: { c: C.am, label: "Fallback" },
  ESCALATE: { c: C.rd, label: "Escalate" },
  MISSING: { c: C.rd, label: "Missing" },
};

async function api(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

export default function AddinTaskPane() {
  const [ready, setReady] = useState(false);
  const [host, setHost] = useState("loading");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [review, setReview] = useState(null);
  const [note, setNote] = useState(null);
  const officeRef = useRef(null);

  // Office.js calls Office.onReady once the host (Word) is wired up.
  useEffect(() => {
    let timer = setInterval(() => {
      if (typeof window !== "undefined" && window.Office) {
        clearInterval(timer);
        officeRef.current = window.Office;
        window.Office.onReady((info) => {
          setHost(info?.host ? String(info.host) : "web");
          setReady(true);
        });
      }
    }, 150);
    return () => clearInterval(timer);
  }, []);

  const hasWord = () => typeof window !== "undefined" && window.Word && officeRef.current;

  // Read the current selection (fallback: whole body) as plain text.
  const readDocumentText = async () => {
    if (!hasWord()) throw new Error("Open this pane inside Microsoft Word to read the document.");
    return window.Word.run(async (ctx) => {
      const sel = ctx.document.getSelection();
      sel.load("text");
      await ctx.sync();
      if (sel.text && sel.text.trim().length > 0) return sel.text;
      const body = ctx.document.body;
      body.load("text");
      await ctx.sync();
      return body.text || "";
    });
  };

  const runReview = async () => {
    setBusy(true); setErr(null); setNote(null);
    try {
      const text = await readDocumentText();
      if (!text.trim()) { setErr("No text selected and the document is empty."); setBusy(false); return; }
      const d = await api("/api/addin/review", { text });
      setReview(d.review);
      if (!d.review.items.length) setNote("Every clause is on your positions — nothing to redline.");
    } catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(false); }
  };

  // Insert the suggested language at the current selection as tracked text.
  const insertSuggestion = async (item) => {
    if (!item.suggestedText) return;
    setErr(null); setNote(null);
    try {
      if (!hasWord()) throw new Error("Open this pane inside Word to insert the redline.");
      await window.Word.run(async (ctx) => {
        // Turn on track-changes so the insertion lands as a reviewable change.
        try { ctx.document.changeTrackingMode = window.Word.ChangeTrackingMode.trackAll; } catch { /* older hosts */ }
        const sel = ctx.document.getSelection();
        sel.insertText(item.suggestedText, window.Word.InsertLocation.replace);
        await ctx.sync();
      });
      setNote(`Inserted redline for ${item.clauseType.replace(/_/g, " ")}. Accept or reject it in Word's Review pane.`);
    } catch (e) { setErr(String(e.message || e)); }
  };

  const s = review?.summary;

  return (
    <>
      <Head><title>ONE Legal — Word add-in</title></Head>
      <Script src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js" strategy="afterInteractive" />
      <div style={{ fontFamily: F, color: C.t1, background: C.bg, minHeight: "100vh", padding: 16, boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontFamily: SR, fontSize: 16 }}>ONE Legal</span>
          <span style={{ fontFamily: M, fontSize: 9, color: C.t4, border: `1px solid ${C.br}`, borderRadius: 4, padding: "1px 6px" }}>WORD</span>
        </div>
        <div style={{ fontSize: 11, color: C.t3, marginBottom: 12 }}>
          Grade the selected text against your playbook and redline it in place.
        </div>

        <button
          onClick={runReview}
          disabled={busy || !ready}
          style={{ width: "100%", padding: "9px 12px", background: C.bl, color: "#fff", border: "none", borderRadius: 6, fontFamily: M, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: busy || !ready ? "default" : "pointer", opacity: busy || !ready ? 0.6 : 1 }}
        >
          {ready ? (busy ? "Reviewing…" : "⟐ Review selection against playbook") : "Connecting to Word…"}
        </button>

        {host && host !== "Word" && ready && (
          <div style={{ fontSize: 10, color: C.t4, fontFamily: M, marginTop: 8 }}>
            Host: {host}. Insertions need Microsoft Word; grading works anywhere.
          </div>
        )}

        {err && <div style={{ color: C.rd, fontFamily: M, fontSize: 11, marginTop: 10 }}>⚠ {err}</div>}
        {note && <div style={{ color: C.gn, fontFamily: M, fontSize: 11, marginTop: 10 }}>{note}</div>}

        {s && (
          <div style={{ marginTop: 14, padding: 12, background: C.cd, border: `1px solid ${s.riskBand === "HIGH" ? C.rd : s.riskBand === "MEDIUM" ? C.am : C.gn}`, borderRadius: 8 }}>
            <div style={{ fontSize: 20, fontFamily: SR, color: s.riskBand === "HIGH" ? C.rd : s.riskBand === "MEDIUM" ? C.am : C.gn }}>
              {s.weightedScore}<span style={{ fontSize: 11, color: C.t3 }}>/100 on-playbook</span>
            </div>
            <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>{s.verdict}</div>
          </div>
        )}

        {(review?.items || []).map((item, i) => {
          const g = GRADE[item.grade] || GRADE.ESCALATE;
          return (
            <div key={i} style={{ marginTop: 10, padding: 12, background: C.cd, border: `1px solid ${C.br}`, borderLeft: `3px solid ${g.c}`, borderRadius: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 9, fontFamily: M, color: "#fff", background: g.c, borderRadius: 4, padding: "2px 7px", letterSpacing: 0.5 }}>{g.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{item.clauseType.replace(/_/g, " ")}</span>
              </div>
              {item.rationale && <div style={{ fontSize: 10.5, color: C.t4, fontStyle: "italic", marginTop: 6 }}>{item.rationale}</div>}
              {item.suggestedText && (
                <>
                  <div style={{ marginTop: 8, padding: "8px 10px", background: `${C.gn}0e`, border: `1px dashed ${C.gn}66`, borderRadius: 6, fontSize: 11.5, lineHeight: 1.5 }}>
                    {item.suggestedText}
                  </div>
                  <button
                    onClick={() => insertSuggestion(item)}
                    style={{ marginTop: 8, padding: "6px 11px", background: "transparent", color: C.gn, border: `1px solid ${C.gn}`, borderRadius: 5, fontFamily: M, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}
                  >
                    ↳ Insert as tracked change
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
