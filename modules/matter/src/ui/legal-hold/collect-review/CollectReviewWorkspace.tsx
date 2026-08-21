/**
 * CollectReviewWorkspace — the first-class, full-page eDiscovery workspace that
 * replaces the cramped rail-Collection card + fixed-overlay reviewer. A guided
 * three-step flow (Collect → Review → Produce) reachable from the hold at
 * /matter/[id]/holds/[holdId]/review.
 *
 * Reuses every existing endpoint — collection (draft/preview/commit), review-set
 * detail, ai-review, item coding, freeze, produce — so this is a pure UI surface
 * over shipped services. "AI proposes, humans dispose": the AI routes each
 * document, a human still codes it behind the unchanged PENDING → coded gate.
 */
import React, { useCallback, useEffect, useState } from "react";
import { C, F, M, SR, useToast } from "@aegis/ui";
import { ReviewStep, ProduceStep, BatchPanel, ValidationPanel, EcaPanel, CopilotPanel } from "@aegis/review/ui";

/** All review-set REST endpoints live under this neutral, module-agnostic base
 *  (matter and privacy both point the shared reviewer here). */
const REVIEW_API = "/api/review/sets";

export interface CollectReviewWorkspaceProps {
  matterId: string;
  holdId: string;
  onBack: () => void;
}

type Step = "collect" | "eca" | "review" | "copilot" | "validate" | "batches" | "produce";
type SetRow = { id: string; name: string; itemCount: number; status: string };

const btn = (bg: string): React.CSSProperties => ({ padding: "12px 18px", background: bg, color: C.bg, border: "none", borderRadius: 8, fontFamily: F, fontSize: 14, fontWeight: 600, cursor: "pointer" });
const ghost = (col: string): React.CSSProperties => ({ padding: "12px 16px", background: "transparent", color: col, border: `1px solid ${col}`, borderRadius: 8, fontFamily: F, fontSize: 14, fontWeight: 600, cursor: "pointer" });

function useHoldPerms() {
  const [canMutate, setCanMutate] = useState(false);
  useEffect(() => {
    fetch("/api/auth/current-user", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setCanMutate(!!(d?.user?.permissions || []).includes?.("matter:legal_hold:issue")))
      .catch(() => {});
  }, []);
  return canMutate;
}

export const CollectReviewWorkspace: React.FC<CollectReviewWorkspaceProps> = ({ matterId, holdId, onBack }) => {
  const canMutate = useHoldPerms();
  const [holdName, setHoldName] = useState<string>("");
  const [holdNumber, setHoldNumber] = useState<string>("");
  const [sets, setSets] = useState<SetRow[]>([]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("collect");

  const loadSets = useCallback(async () => {
    try {
      const r = await fetch(`/api/matter/${matterId}/holds/${holdId}/collection`);
      const d = await r.json();
      if (d.ok) {
        setSets(d.reviewSets);
        if (d.reviewSets.length > 0) {
          setActiveSetId((prev) => prev ?? d.reviewSets[0].id);
          setStep((prev) => (prev === "collect" ? "review" : prev));
        }
      }
    } catch { /* ignore */ }
  }, [matterId, holdId]);

  useEffect(() => { loadSets(); }, [loadSets]);
  useEffect(() => {
    fetch(`/api/matter/${matterId}/holds/${holdId}/summary`).then((r) => r.json()).then((d) => {
      if (d?.summary) { setHoldName(d.summary.name || d.summary.title || ""); setHoldNumber(d.summary.holdNumber || ""); }
    }).catch(() => {});
  }, [matterId, holdId]);

  const activeSet = sets.find((s) => s.id === activeSetId) || null;

  const onCommitted = (setId: string) => { setActiveSetId(setId); loadSets(); setStep("review"); };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.t1, fontFamily: F, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", borderBottom: `1px solid ${C.br}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
          <button onClick={onBack} style={{ ...ghost(C.t3), padding: "8px 12px", fontSize: 12 }}>← Hold</button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: M, fontSize: 10.5, letterSpacing: 1.4, color: C.cy, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {holdName || "Legal hold"}{holdNumber ? ` · ${holdNumber}` : ""}
            </div>
            <div style={{ fontFamily: SR, fontSize: 24, fontWeight: 600 }}>Collect &amp; Review</div>
          </div>
        </div>
        <Stepper step={step} setStep={setStep} hasSets={sets.length > 0} />
      </div>

      {/* Body */}
      {step === "collect" && <CollectStep matterId={matterId} holdId={holdId} canMutate={canMutate} onCommitted={onCommitted} existing={sets} onOpenSet={(id) => { setActiveSetId(id); setStep("review"); }} />}
      {step === "eca" && activeSet && <EcaPanel apiBase={REVIEW_API} reviewSetId={activeSet.id} />}
      {step === "eca" && !activeSet && <Empty label="Collect documents first." />}
      {step === "review" && activeSet && <ReviewStep apiBase={REVIEW_API} reviewSetId={activeSet.id} canMutate={canMutate} onProduce={() => setStep("produce")} onReload={loadSets} />}
      {step === "review" && !activeSet && <Empty label="Collect documents first." />}
      {step === "copilot" && activeSet && <CopilotPanel apiBase={REVIEW_API} reviewSetId={activeSet.id} canMutate={canMutate} />}
      {step === "copilot" && !activeSet && <Empty label="Collect documents first." />}
      {step === "validate" && activeSet && <ValidationPanel apiBase={REVIEW_API} reviewSetId={activeSet.id} canMutate={canMutate} />}
      {step === "validate" && !activeSet && <Empty label="Collect documents first." />}
      {step === "batches" && activeSet && <BatchPanel apiBase={REVIEW_API} reviewSetId={activeSet.id} canMutate={canMutate} />}
      {step === "batches" && !activeSet && <Empty label="Collect documents first." />}
      {step === "produce" && activeSet && <ProduceStep apiBase={REVIEW_API} reviewSetId={activeSet.id} canMutate={canMutate} onReload={loadSets} />}
      {step === "produce" && !activeSet && <Empty label="Nothing to produce yet." />}
    </div>
  );
};

const Empty: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.t4, fontFamily: M, fontSize: 13 }}>{label}</div>
);

// ── Stepper ───────────────────────────────────────────────────────────
const Stepper: React.FC<{ step: Step; setStep: (s: Step) => void; hasSets: boolean }> = ({ step, setStep, hasSets }) => {
  const steps: Array<{ key: Step; n: number; label: string }> = [
    { key: "collect", n: 1, label: "Collect" },
    { key: "eca", n: 2, label: "ECA" },
    { key: "review", n: 3, label: "Review" },
    { key: "copilot", n: 4, label: "Copilot" },
    { key: "validate", n: 5, label: "Validate" },
    { key: "batches", n: 6, label: "Batches" },
    { key: "produce", n: 7, label: "Produce" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {steps.map((s, i) => {
        const active = step === s.key;
        const enabled = s.key === "collect" || hasSets;
        return (
          <React.Fragment key={s.key}>
            {i > 0 && <div style={{ width: 20, height: 1, background: C.brL }} />}
            <button
              onClick={() => enabled && setStep(s.key)}
              disabled={!enabled}
              style={{
                display: "flex", alignItems: "center", gap: 9, padding: "7px 13px", borderRadius: 9, cursor: enabled ? "pointer" : "default",
                background: active ? "rgba(107,142,196,.12)" : "transparent",
                border: `1px solid ${active ? C.bl : C.br}`,
              }}
            >
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: active ? C.bl : "transparent", color: active ? C.bg : C.t4, border: active ? "none" : `1.5px solid ${C.t4}`, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{s.n}</div>
              <span style={{ fontSize: 13, fontWeight: 600, color: active ? C.bl : C.t3 }}>{s.label}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ── Collect step ──────────────────────────────────────────────────────
const inputS: React.CSSProperties = { width: "100%", background: C.cd, border: `1px solid ${C.brL}`, borderRadius: 10, color: C.t1, fontFamily: F, fontSize: 14.5, padding: "13px 15px", outline: "none", boxSizing: "border-box" };
const SOURCES = ["MAILBOX", "ONEDRIVE", "TEAMS", "SHAREPOINT"];
const SOURCE_LABEL: Record<string, string> = { MAILBOX: "Mailbox", ONEDRIVE: "OneDrive", TEAMS: "Teams", SHAREPOINT: "SharePoint" };

const CollectStep: React.FC<{ matterId: string; holdId: string; canMutate: boolean; onCommitted: (id: string) => void; existing: SetRow[]; onOpenSet: (id: string) => void }> = ({ matterId, holdId, canMutate, onCommitted, existing, onOpenSet }) => {
  const toast = useToast();
  const [nl, setNl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [kql, setKql] = useState("");
  const [sources, setSources] = useState<Record<string, boolean>>({ MAILBOX: true, ONEDRIVE: true, TEAMS: true, SHAREPOINT: false });
  const [preview, setPreview] = useState<{ total: number; bySource: Array<{ sourceType: string; total: number }>; custodianCount: number; queryString: string; simulated: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = SOURCES.filter((s) => sources[s]);

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch(`/api/matter/${matterId}/holds/${holdId}/collection`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok || d.ok === false) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
  };
  const runPreview = async () => {
    setBusy(true); setPreview(null);
    try { const d = await post({ preview: true, queryString: kql.trim() || undefined, naturalLanguage: nl, sources: selected }); setPreview(d.preview); if (!kql.trim()) setKql(d.preview.queryString); }
    catch (e) { toast.error(String((e as Error).message || e)); } finally { setBusy(false); }
  };
  const commit = async () => {
    setBusy(true);
    try { const d = await post({ commit: true, queryString: kql.trim() || undefined, naturalLanguage: nl, sources: selected }); toast.success(`Sent ${d.reviewSet.itemCount} to review`); onCommitted(d.reviewSet.id); }
    catch (e) { toast.error(String((e as Error).message || e)); } finally { setBusy(false); }
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", display: "flex", justifyContent: "center", padding: "36px 28px" }}>
      <div style={{ width: 780, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 24 }}>
        {existing.length > 0 && (
          <div style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 12, padding: "14px 18px" }}>
            <div style={{ fontSize: 11, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3, marginBottom: 8 }}>Existing review sets</div>
            {existing.map((s) => (
              <div key={s.id} onClick={() => onOpenSet(s.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", cursor: "pointer" }}>
                <span style={{ fontSize: 14 }}>{s.name}</span>
                <span style={{ fontFamily: M, fontSize: 12, color: C.cy }}>{s.itemCount} · {s.status} →</span>
              </div>
            ))}
          </div>
        )}

        <div>
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>What are you looking for?</div>
          <div style={{ fontSize: 13, color: C.t3, marginBottom: 12 }}>Describe it in plain language. AEGIS collects each custodian&apos;s mailbox and files, then the AI narrows it down.</div>
          <div style={{ display: "flex", gap: 10 }}>
            <input value={nl} onChange={(e) => setNl(e.target.value)} disabled={!canMutate} placeholder="e.g. anything about the Snowflake MSA renewal and the vendorx §8.2 dispute" style={{ ...inputS, flex: 1 }} />
            <button disabled={busy || !canMutate || selected.length === 0} onClick={runPreview} style={btn(C.bl)}>{busy ? "…" : "Preview"}</button>
          </div>
          <div onClick={() => setShowAdvanced((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 12, fontSize: 12.5, color: C.cy, cursor: "pointer" }}>
            <span style={{ fontFamily: M }}>{showAdvanced ? "▾" : "▸"}</span> Advanced query (KeyQL) — for power users
          </div>
          {showAdvanced && (
            <textarea value={kql} onChange={(e) => setKql(e.target.value)} disabled={!canMutate} rows={2} placeholder="participants:&quot;…&quot; — leave blank to scope by custodians only" style={{ ...inputS, marginTop: 8, fontFamily: M, fontSize: 12, resize: "vertical" }} />
          )}
        </div>

        <div>
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Which sources?</div>
          <div style={{ fontSize: 13, color: C.t3, marginBottom: 12 }}>Each custodian on this hold is collected. Toggle the sources to sweep.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {SOURCES.map((s) => (
              <button key={s} disabled={!canMutate} onClick={() => setSources((p) => ({ ...p, [s]: !p[s] }))} style={sources[s] ? { ...btn(C.tl), padding: "9px 15px", fontSize: 13 } : { ...ghost(C.t3), padding: "9px 15px", fontSize: 13 }}>{SOURCE_LABEL[s]}</button>
            ))}
          </div>
        </div>

        {preview && (
          <div style={{ background: C.cd, border: `1px solid ${C.brL}`, borderRadius: 12, padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontFamily: SR, fontSize: 30, fontWeight: 600 }}>{preview.total}</span>
              <span style={{ fontSize: 14, color: C.t2 }}>documents across {preview.custodianCount} custodian(s){preview.simulated ? " · simulated" : ""}</span>
            </div>
            <div style={{ display: "flex", gap: 22, marginTop: 14 }}>
              {preview.bySource.map((b) => (
                <div key={b.sourceType}><div style={{ fontFamily: M, fontSize: 18, fontWeight: 600 }}>{b.total}</div><div style={{ fontSize: 12, color: C.t3 }}>{SOURCE_LABEL[b.sourceType] || b.sourceType}</div></div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20, paddingTop: 18, borderTop: `1px solid ${C.br}` }}>
              <div style={{ fontSize: 12.5, color: C.t3 }}>Committing preserves these in a review set — chain-sealed, nothing altered.</div>
              <button disabled={busy || !canMutate || preview.total === 0} onClick={commit} style={btn(C.gn)}>Send {preview.total} to review →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

