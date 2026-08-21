/**
 * DsarReviewWorkspace — the DSAR-side Collect & Review, mounting the SAME shared
 * reviewer (`@aegis/review/ui`) that legal hold uses. Collect the subject's data
 * into a review set, then work it with the full engine: AI tags + routing,
 * email threading / near-dup / families, multi-dimension coding, and Bates
 * production. "One review engine across the platform."
 */
import React, { useCallback, useEffect, useState } from "react";
import { C, F, M, SR, useToast } from "@aegis/ui";
import { ReviewStep, ProduceStep, BatchPanel, ValidationPanel, EcaPanel, CopilotPanel } from "@aegis/review/ui";

const REVIEW_API = "/api/review/sets";

export interface DsarReviewWorkspaceProps {
  dsarId: string;
  subjectName?: string;
  onBack: () => void;
}

type Step = "collect" | "eca" | "review" | "copilot" | "validate" | "batches" | "produce";
type SetRow = { id: string; name: string; itemCount: number; status: string };

const btn = (bg: string): React.CSSProperties => ({ padding: "12px 18px", background: bg, color: C.bg, border: "none", borderRadius: 8, fontFamily: F, fontSize: 14, fontWeight: 600, cursor: "pointer" });
const ghost = (col: string): React.CSSProperties => ({ padding: "12px 16px", background: "transparent", color: col, border: `1px solid ${col}`, borderRadius: 8, fontFamily: F, fontSize: 14, fontWeight: 600, cursor: "pointer" });

function useDsarPerms() {
  const [canMutate, setCanMutate] = useState(false);
  useEffect(() => {
    fetch("/api/auth/current-user", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setCanMutate(!!(d?.user?.permissions || []).includes?.("privacy:dsar:fulfill")))
      .catch(() => {});
  }, []);
  return canMutate;
}

export const DsarReviewWorkspace: React.FC<DsarReviewWorkspaceProps> = ({ dsarId, subjectName, onBack }) => {
  const toast = useToast();
  const canMutate = useDsarPerms();
  const [sets, setSets] = useState<SetRow[]>([]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("collect");
  const [busy, setBusy] = useState(false);

  const loadSets = useCallback(async () => {
    try {
      const r = await fetch(`/api/privacy/dsar/${dsarId}/review-set`);
      const d = await r.json();
      if (d.ok) {
        setSets(d.reviewSets);
        if (d.reviewSets.length > 0) {
          setActiveSetId((prev) => prev ?? d.reviewSets[0].id);
          setStep((prev) => (prev === "collect" ? "review" : prev));
        }
      }
    } catch { /* ignore */ }
  }, [dsarId]);
  useEffect(() => { loadSets(); }, [loadSets]);

  const activeSet = sets.find((s) => s.id === activeSetId) || null;

  const collect = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/privacy/dsar/${dsarId}/review-set`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error);
      toast.success(`Collected ${d.reviewSet.itemCount} record(s) — opening in eDiscovery`);
      window.location.href = `/review/collections/${d.reviewSet.id}`;
    } catch (e) { toast.error(String((e as Error).message || e)); } finally { setBusy(false); }
  };

  const steps: Array<{ key: Step; n: number; label: string }> = [
    { key: "collect", n: 1, label: "Collect" }, { key: "eca", n: 2, label: "ECA" }, { key: "review", n: 3, label: "Review" }, { key: "copilot", n: 4, label: "Copilot" }, { key: "validate", n: 5, label: "Validate" }, { key: "batches", n: 6, label: "Batches" }, { key: "produce", n: 7, label: "Produce" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.t1, fontFamily: F, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", borderBottom: `1px solid ${C.br}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
          <button onClick={onBack} style={{ ...ghost(C.t3), padding: "8px 12px", fontSize: 12 }}>← DSAR</button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: M, fontSize: 10.5, letterSpacing: 1.4, color: C.cy, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Data subject request{subjectName ? ` · ${subjectName}` : ""}</div>
            <div style={{ fontFamily: SR, fontSize: 24, fontWeight: 600 }}>Collect &amp; Review</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {steps.map((s, i) => {
            const active = step === s.key;
            const enabled = s.key === "collect" || sets.length > 0;
            return (
              <React.Fragment key={s.key}>
                {i > 0 && <div style={{ width: 20, height: 1, background: C.brL }} />}
                <button onClick={() => enabled && setStep(s.key)} disabled={!enabled} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 13px", borderRadius: 9, cursor: enabled ? "pointer" : "default", background: active ? "rgba(107,142,196,.12)" : "transparent", border: `1px solid ${active ? C.bl : C.br}` }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: active ? C.bl : "transparent", color: active ? C.bg : C.t4, border: active ? "none" : `1.5px solid ${C.t4}`, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{s.n}</div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: active ? C.bl : C.t3 }}>{s.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {step === "collect" && (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", justifyContent: "center", padding: "40px 28px" }}>
          <div style={{ width: 720, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 20 }}>
            {sets.length > 0 && (
              <div style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 12, padding: "14px 18px" }}>
                <div style={{ fontSize: 11, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3, marginBottom: 8 }}>Review sets</div>
                {sets.map((s) => (
                  <div key={s.id} onClick={() => { window.location.href = `/review/collections/${s.id}`; }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", cursor: "pointer" }}>
                    <span style={{ fontSize: 14 }}>{s.name}</span>
                    <span style={{ fontFamily: M, fontSize: 12, color: C.cy }}>{s.itemCount} · {s.status} →</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ background: C.cd, border: `1px solid ${C.brL}`, borderRadius: 12, padding: "24px 26px" }}>
              <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Collect the subject&apos;s data</div>
              <div style={{ fontSize: 13, color: C.t3, marginBottom: 16, lineHeight: 1.6 }}>Pull the data subject&apos;s mailbox and files from M365 into a review set, then work it with the full reviewer — AI relevance tags, threading &amp; families, coding, and a delivery-ready production.</div>
              <button disabled={busy || !canMutate} onClick={collect} style={btn(C.gn)}>{busy ? "Collecting…" : "Collect to review set →"}</button>
              {!canMutate && <div style={{ fontSize: 11.5, color: C.t4, fontFamily: M, marginTop: 10 }}>Read-only — you lack privacy:dsar:fulfill.</div>}
            </div>
          </div>
        </div>
      )}
      {step === "eca" && activeSet && <EcaPanel apiBase={REVIEW_API} reviewSetId={activeSet.id} />}
      {step === "eca" && !activeSet && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.t4, fontFamily: M }}>Collect data first.</div>}
      {step === "review" && activeSet && <ReviewStep apiBase={REVIEW_API} reviewSetId={activeSet.id} canMutate={canMutate} onProduce={() => setStep("produce")} onReload={loadSets} />}
      {step === "review" && !activeSet && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.t4, fontFamily: M }}>Collect data first.</div>}
      {step === "copilot" && activeSet && <CopilotPanel apiBase={REVIEW_API} reviewSetId={activeSet.id} canMutate={canMutate} />}
      {step === "copilot" && !activeSet && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.t4, fontFamily: M }}>Collect data first.</div>}
      {step === "validate" && activeSet && <ValidationPanel apiBase={REVIEW_API} reviewSetId={activeSet.id} canMutate={canMutate} />}
      {step === "validate" && !activeSet && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.t4, fontFamily: M }}>Collect data first.</div>}
      {step === "batches" && activeSet && <BatchPanel apiBase={REVIEW_API} reviewSetId={activeSet.id} canMutate={canMutate} />}
      {step === "batches" && !activeSet && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.t4, fontFamily: M }}>Collect data first.</div>}
      {step === "produce" && activeSet && <ProduceStep apiBase={REVIEW_API} reviewSetId={activeSet.id} canMutate={canMutate} onReload={loadSets} />}
      {step === "produce" && !activeSet && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.t4, fontFamily: M }}>Nothing to produce yet.</div>}
    </div>
  );
};
