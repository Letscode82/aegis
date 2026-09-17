import { useState } from "react";
import { C, F, M, SR } from "@aegis/ui";
import { DsarView } from "./dsar-view.jsx";
import { AssessmentsView } from "./assessments-view.jsx";
import { RopaView } from "./ropa-view.jsx";

/**
 * Privacy command center (module #10). Promotes the old standalone "Privacy ·
 * DSAR" tab into a Privacy hub with a sub-nav: Overview + Data Subject
 * Requests today; Assessments (PIA/DPIA), Data Map/RoPA, Consent, Incidents
 * and Retention extend this same shell as they ship — never a 12th module.
 */

// Sub-sections. `status: "live"` renders its component; "soon" shows on the
// Overview hub as upcoming. New sections append here as they ship.
const SECTIONS = [
  { id: "overview", label: "Overview", status: "live" },
  { id: "dsar", label: "Data Subject Requests", status: "live", desc: "Intake, identity verification, AI relevance review, and login-less delivery for access / erasure / portability requests." },
  { id: "assessments", label: "Assessments", status: "live", desc: "PIA · DPIA · transfer (TIA) · legitimate-interest (LIA) · AI · vendor assessments with templates, risk scoring, and a human approval gate." },
  { id: "ropa", label: "Data Map / RoPA", status: "live", desc: "Article 30 records of processing, systems inventory, data-flow and cross-border transfer mapping." },
  { id: "consent", label: "Consent", status: "soon", desc: "Consent capture, receipts, and preference management with proof-of-consent audit." },
  { id: "incidents", label: "Incidents & Breach", status: "soon", desc: "Incident intake, breach-risk assessment, and the 72-hour regulatory notification clock." },
  { id: "retention", label: "Retention", status: "soon", desc: "Retention schedules and hold-aware disposal workflows." },
];

function Overview({ go }) {
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10, fontFamily: M, letterSpacing: 2, color: C.tl, textTransform: "uppercase" }}>Operations · Privacy &amp; Compliance</div>
        <div style={{ fontSize: 24, fontFamily: SR, color: C.t1, lineHeight: 1.2 }}>Privacy program, <em style={{ color: C.tl, fontStyle: "italic" }}>one brain</em></div>
        <div style={{ fontSize: 12, color: C.t3, fontFamily: M, marginTop: 4 }}>Every privacy record shares the platform&apos;s entities and chain-sealed audit — no siloed privacy database.</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {SECTIONS.filter((s) => s.id !== "overview").map((s) => {
          const live = s.status === "live";
          return (
            <div key={s.id} onClick={live ? () => go(s.id) : undefined}
              style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 8, padding: 16, cursor: live ? "pointer" : "default", opacity: live ? 1 : 0.72 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 14.5, fontFamily: SR, color: C.t1 }}>{s.label}</span>
                <span style={{ fontSize: 8.5, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", padding: "2px 7px", borderRadius: 4, color: live ? C.gn : C.t4, border: `1px solid ${live ? C.gn : C.br}` }}>{live ? "Available" : "Coming soon"}</span>
              </div>
              <div style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.5 }}>{s.desc}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PrivacyShell() {
  const [tab, setTab] = useState("dsar");
  const live = SECTIONS.filter((s) => s.status === "live");

  return (
    <div style={{ fontFamily: F, color: C.t1 }}>
      {/* Sub-nav */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18, borderBottom: `1px solid ${C.br}`, paddingBottom: 10 }}>
        {live.map((s) => {
          const active = tab === s.id;
          return (
            <button key={s.id} onClick={() => setTab(s.id)} style={{
              padding: "7px 14px", borderRadius: 20, cursor: "pointer", fontFamily: F, fontSize: 12.5, fontWeight: active ? 600 : 500,
              background: active ? C.tl : "transparent", color: active ? C.bg : C.t2,
              border: `1px solid ${active ? C.tl : C.br}`,
            }}>{s.label}</button>
          );
        })}
      </div>

      {tab === "overview" && <Overview go={setTab} />}
      {tab === "dsar" && <DsarView />}
      {tab === "assessments" && <AssessmentsView />}
      {tab === "ropa" && <RopaView />}
    </div>
  );
}
