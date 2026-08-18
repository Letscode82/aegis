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
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { C, F, M, SR, useToast } from "@aegis/ui";

export interface CollectReviewWorkspaceProps {
  matterId: string;
  holdId: string;
  onBack: () => void;
}

type Step = "collect" | "review" | "produce";
type SetRow = { id: string; name: string; itemCount: number; status: string };

const routeColor = (r: string | null): string => (r === "ATTORNEY" ? C.pp : r === "REVIEWER" ? C.bl : C.t4);
const routeLabel = (r: string | null): string => (r === "ATTORNEY" ? "Attorney" : r === "REVIEWER" ? "Reviewer" : r === "AUTO_CULL" ? "Auto-cull" : "");
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
      {step === "review" && activeSet && <ReviewStep reviewSetId={activeSet.id} canMutate={canMutate} onProduce={() => setStep("produce")} onReload={loadSets} />}
      {step === "review" && !activeSet && <Empty label="Collect documents first." />}
      {step === "produce" && activeSet && <ProduceStep reviewSetId={activeSet.id} canMutate={canMutate} onReload={loadSets} />}
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
    { key: "review", n: 2, label: "Review" },
    { key: "produce", n: 3, label: "Produce" },
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

// ── Review step (3-pane) ──────────────────────────────────────────────
interface Item {
  id: string; sourceType: string; sourceSystem: string; title: string; excerpt: string | null; graphId: string | null; webUrl: string | null;
  aiVerdict: string | null; aiScore: number | null; aiRationale: string | null; aiRoute: string | null; aiTags: unknown; coded: boolean;
  codedResponsive: boolean | null; codedPrivileged: boolean; redact: boolean;
  issues: string[]; confidentiality: string | null; privilegeBasis: string | null; reviewNote: string | null;
  familyId: string | null; familyRole: string | null; threadId: string | null; isInclusive: boolean | null; dedupKey: string | null;
}
type Issue = { key: string; label: string };
type RouteFilter = "ALL" | "ATTORNEY" | "REVIEWER" | "AUTO_CULL";
const CONFIDENTIALITY = ["None", "Confidential", "Highly Confidential", "Attorneys' Eyes Only"];
const PRIV_TERMS = ["privileged", "attorney-client", "confidential", "work product", "outside counsel", "legal advice"];

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function highlight(text: string, terms: string[]): React.ReactNode {
  const clean = terms.map((t) => t.trim()).filter((t) => t.length >= 3);
  if (clean.length === 0) return text;
  const lookup = new Set(clean.map((t) => t.toLowerCase()));
  const parts = text.split(new RegExp(`(${clean.map(escapeRe).join("|")})`, "gi"));
  return parts.map((p, i) => (lookup.has(p.toLowerCase()) ? <mark key={i} style={{ background: "rgba(224,179,74,.28)", color: C.t1, borderRadius: 3, padding: "0 1px" }}>{p}</mark> : <React.Fragment key={i}>{p}</React.Fragment>));
}
function aiPriority(i: Item): number {
  const base = i.aiVerdict === "RELEVANT" ? 2 : i.aiVerdict === "UNCLEAR" ? 1 : 0;
  return base + (i.aiScore ?? 0) + (i.aiRoute === "ATTORNEY" ? 0.5 : 0);
}

const ReviewStep: React.FC<{ reviewSetId: string; canMutate: boolean; onProduce: () => void; onReload: () => void }> = ({ reviewSetId, canMutate, onProduce, onReload }) => {
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<string>("OPEN");
  const [criteria, setCriteria] = useState<string>("");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [cursor, setCursor] = useState(0);
  const [filter, setFilter] = useState<RouteFilter>("ALL");
  const [query, setQuery] = useState("");
  const [sortByPriority, setSortByPriority] = useState(true);
  const [hideSuppressed, setHideSuppressed] = useState(false);
  const [propagateFamily, setPropagateFamily] = useState(true);
  const [runningAi, setRunningAi] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    fetch(`/api/matter/review-sets/${reviewSetId}`).then((r) => r.json()).then((d) => {
      if (d.ok) { setItems(d.items); setStatus(d.summary.status); setCriteria(d.summary.criteria ?? ""); setIssues(d.summary.issues ?? []); }
    }).catch(() => {});
  }, [reviewSetId]);
  useEffect(() => { load(); }, [load]);

  const frozen = status !== "OPEN";
  const counts = useMemo(() => ({
    all: items.length,
    ATTORNEY: items.filter((i) => i.aiRoute === "ATTORNEY").length,
    REVIEWER: items.filter((i) => i.aiRoute === "REVIEWER").length,
    AUTO_CULL: items.filter((i) => i.aiRoute === "AUTO_CULL").length,
  }), [items]);
  // Family / thread / near-dup derived state.
  const derived = useMemo(() => {
    const threadSize = new Map<string, number>();
    const familyCount = new Map<string, number>(); // parent familyId → attachment count
    const dupIds = new Set<string>();
    const seenDedup = new Set<string>();
    for (const i of items) {
      if (i.threadId) threadSize.set(i.threadId, (threadSize.get(i.threadId) ?? 0) + 1);
      if (i.familyRole === "ATTACHMENT" && i.familyId) familyCount.set(i.familyId, (familyCount.get(i.familyId) ?? 0) + 1);
      if (i.dedupKey) { if (seenDedup.has(i.dedupKey)) dupIds.add(i.id); else seenDedup.add(i.dedupKey); }
    }
    const suppressed = new Set<string>();
    for (const i of items) { if (i.isInclusive === false || dupIds.has(i.id)) suppressed.add(i.id); }
    return { threadSize, familyCount, dupIds, suppressed };
  }, [items]);

  const filtered = useMemo(() => {
    let list = items.filter((i) => {
      if (filter !== "ALL" && i.aiRoute !== filter) return false;
      if (hideSuppressed && derived.suppressed.has(i.id)) return false;
      if (query.trim()) { const q = query.toLowerCase(); return i.title.toLowerCase().includes(q) || (i.sourceSystem || "").toLowerCase().includes(q); }
      return true;
    });
    if (sortByPriority) list = [...list].sort((a, b) => aiPriority(b) - aiPriority(a));
    return list;
  }, [items, filter, query, sortByPriority, hideSuppressed, derived]);
  useEffect(() => { if (cursor >= filtered.length) setCursor(0); }, [filtered.length, cursor]);
  const current = filtered[cursor];

  const coded = items.filter((i) => i.coded).length;
  const responsive = items.filter((i) => i.codedResponsive === true).length;
  const privileged = items.filter((i) => i.codedPrivileged).length;

  const patch = async (id: string, body: Record<string, unknown>) => {
    const r = await fetch(`/api/matter/review-sets/${reviewSetId}/items/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
    return d.item as Item;
  };
  const code = useCallback(async (body: Record<string, unknown>, advance: boolean) => {
    if (!current || !canMutate || frozen) return;
    const full = propagateFamily && current.familyId ? { ...body, propagateFamily: true } : body;
    try {
      const item = await patch(current.id, full);
      setItems((prev) => prev.map((it) => (it.id === current.id ? { ...it, ...item } : it)));
      if (advance) setCursor((c) => Math.min(filtered.length - 1, c + 1));
      // A family-propagated decision changed siblings too — refresh to reflect them.
      if (propagateFamily && current.familyId && ("responsive" in body || "privileged" in body || "redact" in body)) load();
    } catch (e) { toast.error(String((e as Error).message || e)); }
  }, [current, canMutate, frozen, reviewSetId, filtered.length, propagateFamily, toast, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const bulkCode = async (body: Record<string, unknown>) => {
    if (selected.size === 0 || !canMutate || frozen) return;
    try {
      const ids = [...selected];
      const updated = await Promise.all(ids.map((id) => patch(id, body).catch(() => null)));
      setItems((prev) => prev.map((it) => { const u = updated.find((x) => x && x.id === it.id); return u ? { ...it, ...u } : it; }));
      toast.success(`Coded ${updated.filter(Boolean).length} document(s)`);
      setSelected(new Set());
    } catch (e) { toast.error(String((e as Error).message || e)); }
  };
  const toggleSel = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const saveCriteria = async () => {
    try {
      const r = await fetch(`/api/matter/review-sets/${reviewSetId}/criteria`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ criteria, issues }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error);
      toast.success("Review criteria saved");
    } catch (e) { toast.error(String((e as Error).message || e)); }
  };
  const runAi = async () => {
    setRunningAi(true);
    try {
      const r = await fetch(`/api/matter/review-sets/${reviewSetId}/ai-review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pendingOnly: false }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error);
      toast.success(`AI review: ${d.scored} scored · ${d.routes.attorney} attorney · ${d.routes.reviewer} reviewer · ${d.routes.autoCull} auto-cull`);
      load();
    } catch (e) { toast.error(String((e as Error).message || e)); } finally { setRunningAi(false); }
  };
  const freezeAndProduce = async () => {
    try {
      if (!frozen) { const r = await fetch(`/api/matter/review-sets/${reviewSetId}/freeze`, { method: "POST" }); const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error); }
      onReload(); onProduce();
    } catch (e) { toast.error(String((e as Error).message || e)); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.tagName === "SELECT") return;
      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(filtered.length - 1, c + 1)); }
      else if (k === "k" || e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
      else if (k === "r") { e.preventDefault(); code({ responsive: true }, true); }
      else if (k === "n") { e.preventDefault(); code({ responsive: false }, true); }
      else if (k === "p") { e.preventDefault(); code({ privileged: !current?.codedPrivileged }, false); }
      else if (k === "x") { e.preventDefault(); code({ redact: !current?.redact }, false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered.length, code, current]);

  const chip = (key: RouteFilter, label: string, n: number, col: string) => (
    <button onClick={() => { setFilter(key); setCursor(0); }} style={{
      fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 20, cursor: "pointer",
      background: filter === key ? (key === "ALL" ? C.s1 : "transparent") : "transparent",
      color: key === "ALL" ? C.t1 : col, border: `1px solid ${filter === key ? (key === "ALL" ? C.brL : col) : C.br}`,
      display: "flex", alignItems: "center", gap: 6,
    }}>
      {key !== "ALL" && <span style={{ width: 7, height: 7, borderRadius: "50%", background: col }} />}{label} {n}
    </button>
  );

  const hlTerms = useMemo(() => [...issues.map((i) => i.label), ...PRIV_TERMS, ...(query.trim() ? [query.trim()] : [])], [issues, query]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Setup bar (criteria + issues) */}
      <div style={{ borderBottom: `1px solid ${C.br}`, padding: "10px 20px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button onClick={() => setSetupOpen((v) => !v)} style={{ ...ghost(C.cy), padding: "6px 11px", fontSize: 11 }}>{setupOpen ? "▾" : "▸"} Review setup</button>
        <div style={{ fontSize: 12.5, color: C.t3, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {criteria ? <><span style={{ color: C.t2 }}>Criteria:</span> {criteria}</> : <span style={{ fontStyle: "italic" }}>No criteria set — the AI review scores against the set name until you add one.</span>}
        </div>
        <label style={{ fontSize: 12, color: C.t3, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={sortByPriority} onChange={(e) => { setSortByPriority(e.target.checked); setCursor(0); }} /> AI-prioritized
        </label>
        <label style={{ fontSize: 12, color: C.t3, display: "flex", alignItems: "center", gap: 6 }} title="Hide older thread messages and near-duplicates">
          <input type="checkbox" checked={hideSuppressed} onChange={(e) => { setHideSuppressed(e.target.checked); setCursor(0); }} /> Suppress dupes{derived.suppressed.size > 0 ? ` (${derived.suppressed.size})` : ""}
        </label>
      </div>
      {setupOpen && (
        <div style={{ borderBottom: `1px solid ${C.br}`, padding: "14px 20px", background: C.cd, display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: C.t3, marginBottom: 5 }}>Responsiveness criteria (drives the AI review)</div>
            <textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} disabled={!canMutate} rows={2} placeholder="e.g. Documents about the Snowflake MSA renewal, vendorx pricing, or IP §8.2 ownership are responsive." style={{ ...inputS, fontSize: 13, resize: "vertical" }} />
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: C.t3, marginBottom: 5 }}>Issue codes (comma-separated — used for per-issue AI tags + coding)</div>
            <input value={issues.map((i) => i.label).join(", ")} onChange={(e) => setIssues(e.target.value.split(",").map((s) => s.trim()).filter(Boolean).map((label) => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label })))} disabled={!canMutate} placeholder="Pricing, IP §8.2, Privilege, Damages" style={{ ...inputS, fontSize: 13 }} />
          </div>
          <div><button disabled={!canMutate} onClick={saveCriteria} style={{ ...btn(C.bl), padding: "9px 16px", fontSize: 13 }}>Save criteria</button></div>
        </div>
      )}

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "320px minmax(0,1fr) 360px", minHeight: 0 }}>
      {/* LEFT list */}
      <div style={{ borderRight: `1px solid ${C.br}`, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: "16px 18px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Documents</div>
            <button disabled={!canMutate || frozen || runningAi} onClick={runAi} style={{ ...ghost(C.bl), padding: "6px 11px", fontSize: 11 }}>{runningAi ? "Running…" : "Run AI review"}</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {chip("ALL", "All", counts.all, C.t1)}
            {chip("ATTORNEY", "Attorney", counts.ATTORNEY, C.pp)}
            {chip("REVIEWER", "Reviewer", counts.REVIEWER, C.bl)}
            {chip("AUTO_CULL", "Auto-cull", counts.AUTO_CULL, C.t4)}
          </div>
          <input value={query} onChange={(e) => { setQuery(e.target.value); setCursor(0); }} placeholder="Search subject or custodian…" style={{ ...inputS, padding: "9px 12px", fontSize: 13, borderColor: C.br, background: C.bg }} />
        </div>
        {selected.size > 0 && (
          <div style={{ margin: "0 8px 8px", padding: "8px 10px", background: C.s1, border: `1px solid ${C.brL}`, borderRadius: 8, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, fontFamily: M, color: C.t2 }}>{selected.size} selected</span>
            <button disabled={frozen} onClick={() => bulkCode({ responsive: true })} style={{ ...ghost(C.gn), padding: "4px 9px", fontSize: 10.5 }}>Responsive</button>
            <button disabled={frozen} onClick={() => bulkCode({ responsive: false })} style={{ ...ghost(C.t3), padding: "4px 9px", fontSize: 10.5 }}>Not resp.</button>
            <button disabled={frozen} onClick={() => bulkCode({ privileged: true })} style={{ ...ghost(C.pp), padding: "4px 9px", fontSize: 10.5 }}>Privileged</button>
            <button onClick={() => setSelected(new Set())} style={{ ...ghost(C.t4), padding: "4px 9px", fontSize: 10.5 }}>Clear</button>
          </div>
        )}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px" }}>
          {filtered.map((it, i) => (
            <div key={it.id} style={{ padding: "10px 10px", borderRadius: 9, marginBottom: 3, background: i === cursor ? C.s1 : "transparent", border: `1px solid ${i === cursor ? C.brL : "transparent"}`, display: "flex", gap: 9, opacity: it.aiRoute === "AUTO_CULL" && !it.coded ? 0.62 : 1 }}>
              <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggleSel(it.id)} onClick={(e) => e.stopPropagation()} style={{ marginTop: 4, flex: "none" }} />
              <div onClick={() => setCursor(i)} style={{ minWidth: 0, cursor: "pointer", flex: 1, display: "flex", gap: 9 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: it.coded ? (it.codedResponsive ? (it.codedPrivileged ? C.pp : C.gn) : C.t4) : routeColor(it.aiRoute), marginTop: 5, flex: "none" }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: i === cursor ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.familyRole === "ATTACHMENT" ? <span style={{ color: C.t4 }}>↳ </span> : null}{it.title}</div>
                  <div style={{ fontSize: 11.5, color: C.t3, marginTop: 3, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                    <span>{it.sourceSystem}{it.aiRoute ? <> · <span style={{ color: routeColor(it.aiRoute), fontWeight: 600 }}>{routeLabel(it.aiRoute)}</span></> : ""}{it.coded ? " · ✓" : ""}</span>
                    {it.familyRole === "PARENT" && derived.familyCount.get(it.familyId!) ? <MiniBadge text={`+${derived.familyCount.get(it.familyId!)} attach`} col={C.cy} /> : null}
                    {it.familyRole === "ATTACHMENT" ? <MiniBadge text="attachment" col={C.t4} /> : null}
                    {it.threadId && (derived.threadSize.get(it.threadId) ?? 0) > 1 ? <MiniBadge text={`thread ${derived.threadSize.get(it.threadId)}${it.isInclusive ? " · incl" : ""}`} col={C.bl} /> : null}
                    {derived.dupIds.has(it.id) ? <MiniBadge text="dup" col={C.am} /> : null}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ padding: 16, color: C.t4, fontFamily: M, fontSize: 12 }}>No documents match.</div>}
        </div>
      </div>

      {/* CENTER viewer */}
      <div style={{ overflowY: "auto", minHeight: 0 }}>
        {!current ? <div style={{ padding: 40, color: C.t4, fontFamily: M }}>Select a document.</div> : (
          <div style={{ padding: "24px 34px" }}>
            <div style={{ fontFamily: M, fontSize: 11, color: C.t3, letterSpacing: .4, textTransform: "uppercase" }}>{current.sourceType} · {current.sourceSystem}</div>
            <div style={{ fontFamily: SR, fontSize: 22, fontWeight: 600, margin: "8px 0 14px", lineHeight: 1.25 }}>{highlight(current.title, hlTerms)}</div>
            {/* Metadata strip */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11.5, color: C.t3, marginBottom: 14 }}>
              <span><span style={{ color: C.t4 }}>Source</span> {current.sourceType}</span>
              <span><span style={{ color: C.t4 }}>Custodian</span> {current.sourceSystem}</span>
              {current.graphId && <span><span style={{ color: C.t4 }}>Graph id</span> <span style={{ fontFamily: M }}>{current.graphId.slice(0, 16)}…</span></span>}
              {current.webUrl && <a href={current.webUrl} target="_blank" rel="noreferrer" style={{ color: C.cy }}>Open in M365 ↗</a>}
            </div>
            {current.aiRoute && (
              <div style={{ border: `1px solid ${routeColor(current.aiRoute)}55`, background: `${routeColor(current.aiRoute)}1a`, borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>AI: {current.aiVerdict || "—"}</span>
                  {current.aiScore != null && <span style={{ fontFamily: M, fontSize: 12, color: C.t2 }}>{Math.round(current.aiScore * 100)}% confidence</span>}
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: .5, color: routeColor(current.aiRoute), border: `1px solid ${routeColor(current.aiRoute)}`, borderRadius: 5, padding: "2px 8px" }}>ROUTE → {routeLabel(current.aiRoute).toUpperCase()}</span>
                </div>
                {current.aiRationale && <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.6, marginTop: 7 }}>{current.aiRationale}</div>}
              </div>
            )}
            <div style={{ marginTop: 18, padding: "22px 24px", background: C.cd, border: `1px solid ${C.br}`, borderRadius: 12, fontSize: 14.5, lineHeight: 1.8, color: C.t2, whiteSpace: "pre-wrap" }}>
              {current.excerpt ? highlight(current.excerpt, hlTerms) : <span style={{ color: C.t4, fontStyle: "italic" }}>No preview text — open in M365 for the full item.</span>}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT decision */}
      <div style={{ borderLeft: `1px solid ${C.br}`, display: "flex", flexDirection: "column", minHeight: 0, padding: "20px", overflowY: "auto" }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Your decision</div>
        <div style={{ fontSize: 12.5, color: C.t3, lineHeight: 1.5, marginBottom: 16 }}>The AI proposes — you decide. Nothing is produced or withheld until you code it.</div>
        {current && <>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <DecisionBtn label="Responsive" hint="R" active={current.codedResponsive === true} col={C.gn} onClick={() => code({ responsive: true }, true)} disabled={!canMutate || frozen} />
            <DecisionBtn label="Not responsive" hint="N" active={current.codedResponsive === false} col={C.t3} onClick={() => code({ responsive: false }, true)} disabled={!canMutate || frozen} />
            <DecisionBtn label="Privileged — withhold" hint="P" active={current.codedPrivileged} col={C.pp} onClick={() => code({ privileged: !current.codedPrivileged }, false)} disabled={!canMutate || frozen} />
            <DecisionBtn label="Redact" hint="X" active={current.redact} col={C.am} onClick={() => code({ redact: !current.redact }, false)} disabled={!canMutate || frozen} />
          </div>

          {current.familyId && (
            <label style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, fontSize: 12, color: C.t3 }}>
              <input type="checkbox" checked={propagateFamily} onChange={(e) => setPropagateFamily(e.target.checked)} /> Apply to the whole family (email + {derived.familyCount.get(current.familyId) ?? 0} attachment{(derived.familyCount.get(current.familyId) ?? 0) === 1 ? "" : "s"})
            </label>
          )}

          {current.codedPrivileged && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.pp, marginBottom: 5 }}>Privilege basis (privilege log)</div>
              <input defaultValue={current.privilegeBasis ?? ""} onBlur={(e) => code({ privilegeBasis: e.target.value }, false)} placeholder="Attorney-client privilege / work product" style={{ ...inputS, fontSize: 12.5, padding: "9px 11px" }} />
            </div>
          )}

          {issues.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 6 }}>Issues</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {issues.map((iss) => {
                  const on = current.issues.includes(iss.key);
                  return <button key={iss.key} disabled={!canMutate || frozen} onClick={() => code({ issues: on ? current.issues.filter((k) => k !== iss.key) : [...current.issues, iss.key] }, false)} style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 7, cursor: "pointer", background: on ? C.tl : "transparent", color: on ? C.bg : C.t2, border: `1px solid ${on ? C.tl : C.br}` }}>{iss.label}</button>;
                })}
              </div>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 5 }}>Confidentiality</div>
            <select defaultValue={current.confidentiality ?? "None"} onChange={(e) => code({ confidentiality: e.target.value === "None" ? null : e.target.value }, false)} disabled={!canMutate || frozen} style={{ ...inputS, fontSize: 12.5, padding: "9px 11px" }}>
              {CONFIDENTIALITY.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 5 }}>Notes</div>
            <textarea key={current.id} defaultValue={current.reviewNote ?? ""} onBlur={(e) => code({ note: e.target.value }, false)} rows={2} placeholder="Reviewer note…" style={{ ...inputS, fontSize: 12.5, padding: "9px 11px", resize: "vertical" }} />
          </div>
        </>}

        <div style={{ height: 1, background: C.br, margin: "20px 0" }} />
        <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: .6, color: C.t3, textTransform: "uppercase", marginBottom: 10 }}>Coding progress</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span style={{ fontFamily: SR, fontSize: 30, fontWeight: 600 }}>{coded}</span><span style={{ fontSize: 14, color: C.t3 }}>of {items.length} coded</span></div>
        <div style={{ height: 8, background: C.bg, border: `1px solid ${C.br}`, borderRadius: 6, marginTop: 10, overflow: "hidden" }}><div style={{ width: `${items.length ? (coded / items.length) * 100 : 0}%`, height: "100%", background: C.bl }} /></div>
        <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 12, color: C.t3 }}><span><span style={{ color: C.gn, fontWeight: 600 }}>{responsive}</span> responsive</span><span><span style={{ color: C.pp, fontWeight: 600 }}>{privileged}</span> privileged</span></div>
        <div style={{ flex: 1, minHeight: 16 }} />
        <button disabled={!canMutate} onClick={freezeAndProduce} style={{ ...btn(C.gn), textAlign: "center" }}>{frozen ? "Go to Produce →" : "Freeze & Produce →"}</button>
      </div>
      </div>
    </div>
  );
};

const MiniBadge: React.FC<{ text: string; col: string }> = ({ text, col }) => (
  <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .3, color: col, border: `1px solid ${col}55`, background: `${col}14`, borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap" }}>{text}</span>
);

const DecisionBtn: React.FC<{ label: string; hint: string; active: boolean; col: string; onClick: () => void; disabled: boolean }> = ({ label, hint, active, col, onClick, disabled }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: "12px 14px", borderRadius: 8, fontFamily: F, fontSize: 14, fontWeight: 600, cursor: disabled ? "default" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    background: active ? col : "transparent", color: active ? C.bg : col, border: `1px solid ${active ? col : (col === C.t3 ? C.brL : col)}`,
  }}>
    <span>{label}</span><span style={{ fontFamily: M, fontSize: 11, opacity: 0.75 }}>{hint}</span>
  </button>
);

// ── Produce step ──────────────────────────────────────────────────────
interface Manifest { batesPrefix: string; produced: Array<{ bates: string; title: string; redacted: boolean }>; privilegeLog: Array<{ logNo: string; title: string; basis: string }>; counts: { produced: number; privileged: number; nonResponsive: number; uncoded: number } }

const ProduceStep: React.FC<{ reviewSetId: string; canMutate: boolean; onReload: () => void }> = ({ reviewSetId, canMutate, onReload }) => {
  const toast = useToast();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [busy, setBusy] = useState(false);
  const [prefix, setPrefix] = useState("AEGIS");

  const produce = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/matter/review-sets/${reviewSetId}/produce`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batesPrefix: prefix.trim() || "AEGIS" }) });
      const d = await r.json(); if (!r.ok || !d.ok) throw new Error(d.error);
      setManifest(d.manifest); onReload();
      toast.success(`Produced ${d.manifest.counts.produced} · ${d.manifest.counts.privileged} withheld`);
    } catch (e) { toast.error(String((e as Error).message || e)); } finally { setBusy(false); }
  };
  const download = () => {
    if (!manifest) return;
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `production-${reviewSetId}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", display: "flex", justifyContent: "center", padding: "36px 28px" }}>
      <div style={{ width: 780, maxWidth: "100%" }}>
        {!manifest ? (
          <div style={{ background: C.cd, border: `1px solid ${C.brL}`, borderRadius: 12, padding: "24px 26px" }}>
            <div style={{ fontFamily: SR, fontSize: 19, fontWeight: 600, marginBottom: 6 }}>Produce the review set</div>
            <div style={{ fontSize: 13, color: C.t3, marginBottom: 18, lineHeight: 1.6 }}>Responsive, non-privileged documents get sequential Bates numbers. Responsive &amp; privileged documents are withheld to a privilege log. Every item must be coded first.</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: C.t2 }}>Bates prefix</span>
              <input value={prefix} onChange={(e) => setPrefix(e.target.value)} style={{ ...inputS, width: 180, padding: "10px 12px", fontFamily: M }} />
              <button disabled={busy || !canMutate} onClick={produce} style={btn(C.gn)}>{busy ? "Producing…" : "Produce →"}</button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontFamily: SR, fontSize: 19, fontWeight: 600 }}>Production manifest</div>
              <button onClick={download} style={btn(C.bl)}>⬇ Download load file (JSON)</button>
            </div>
            <div style={{ fontSize: 13, color: C.t2, marginBottom: 16 }}>{manifest.counts.produced} produced · {manifest.counts.privileged} withheld (privilege) · {manifest.counts.nonResponsive} non-responsive</div>
            <div style={{ fontSize: 10.5, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.t3, marginBottom: 6 }}>Produced (Bates)</div>
            <div style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
              {manifest.produced.map((x) => <div key={x.bates} style={{ fontFamily: M, fontSize: 12, color: C.t2, padding: "3px 0" }}>{x.bates} · {x.title}{x.redacted ? " (redacted)" : ""}</div>)}
              {manifest.produced.length === 0 && <div style={{ fontSize: 12, color: C.t4 }}>None.</div>}
            </div>
            {manifest.privilegeLog.length > 0 && <>
              <div style={{ fontSize: 10.5, fontFamily: M, letterSpacing: .8, textTransform: "uppercase", color: C.pp, marginBottom: 6 }}>Privilege log</div>
              <div style={{ background: C.cd, border: `1px solid ${C.br}`, borderRadius: 10, padding: "10px 14px" }}>
                {manifest.privilegeLog.map((x) => <div key={x.logNo} style={{ fontFamily: M, fontSize: 12, color: C.t2, padding: "3px 0" }}>{x.logNo} · {x.title} — {x.basis}</div>)}
              </div>
            </>}
          </div>
        )}
      </div>
    </div>
  );
};
