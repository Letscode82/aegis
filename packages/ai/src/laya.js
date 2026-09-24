// Laya — System-1 typed-decision engine for intake triage.
//
// Laya (https://github.com/NandhaKishorM/laya, Apache-2.0) is a
// non-autoregressive decision engine: it returns typed `choice` / `score` /
// `noul` decisions over text in a single forward pass (~33 ms), in 100+
// languages, self-hosted. Its HTTP API is schema-identical to the paid JEV
// service (`POST /v1/systemone`), so this is a drop-in for either — we run
// the open-source Laya so confidential legal text never leaves the tenant.
//
// Rollout: intake triage first (this file), other surfaces (eDiscovery
// relevance, DSAR review, clause risk) once results are good.
//
// It slots between the regex classifier (deterministic floor) and Claude
// (System 2): Laya classifies the request semantically; the category then
// maps to the SAME team / SLA / priority the regex classifier uses, so
// downstream behavior is unchanged. Everything degrades gracefully — if
// `LAYA_URL` is unset, the service is down, or the call is low-confidence,
// this returns `null` and the caller falls back to regex.
//
// Config (server-side only — the URL is an internal service address):
//   LAYA_URL       base URL of the Laya server (e.g. http://laya:8000). Unset → disabled.
//   LAYA_API_KEY   optional bearer token (matches the server's LAYA_API_KEY).

// Category → triage fields. Values mirror classify-regex.js so a Laya
// decision produces an identical downstream shape (team / SLA / priority /
// risk / effort). Keep these two tables in lock-step.
const CATEGORY_MAP = {
  "Employment — Sensitive": { priority: "Critical", team: "Employment Team + GC", sla: "4 hrs", slaHours: 4, risk: "Critical", note: "Auto-escalated to GC per policy", hrs: 20 },
  "Litigation — Non-Court": { priority: "High", team: "Litigation Team", sla: "8 hrs", slaHours: 8, risk: "High", note: "Litigation intake — attorney review; confirm deadline + preservation", hrs: 12 },
  "NDA — Standard": { priority: "Low", team: "AI Auto-Draft", sla: "2 hrs", slaHours: 2, risk: "None", note: "Auto-draft from playbook template", hrs: 0 },
  "Finance — Debt / Covenant": { priority: "High", team: "Finance Legal + GC", sla: "8 hrs", slaHours: 8, risk: "High", note: "Board-level exposure — GC review required", hrs: 10 },
  "IP / Trademark / OSS": { priority: "Medium", team: "IP Team — David Park", sla: "24 hrs", slaHours: 24, risk: "Low", note: "Routine IP clearance", hrs: 3 },
  "Privacy — DPIA / GDPR": { priority: "Medium", team: "Privacy Team", sla: "24 hrs", slaHours: 24, risk: "Medium", note: "DPIA may be required", hrs: 5 },
  "Compliance — Sanctions": { priority: "Critical", team: "Compliance + GC", sla: "4 hrs", slaHours: 4, risk: "Critical", note: "Auto-hold pending screen", hrs: 12 },
  "Regulatory — EU": { priority: "High", team: "EU Counsel + GC", sla: "12 hrs", slaHours: 12, risk: "High", note: "Client-facing requires GC sign-off", hrs: 6 },
  "Vendor Contract": { priority: "High", team: "Commercial Contracts — Maria Chen", sla: "24 hrs", slaHours: 24, risk: "Medium", note: "Size threshold triggers GDPR check", hrs: 4 },
  "Vendor DD": { priority: "Medium", team: "Compliance Team", sla: "72 hrs", slaHours: 72, risk: "Medium", note: "Enhanced DD per jurisdiction policy", hrs: 8 },
};

// Short descriptions steer Laya's `choice`. "General Inquiry" is a catch-all
// with no CATEGORY_MAP entry, so choosing it returns null → the caller's
// default triage applies (single source of truth for the default).
const CRITERIA = {
  "Employment — Sensitive": "harassment, discrimination, retaliation, wrongful termination, or other sensitive workplace misconduct",
  "Litigation — Non-Court": "lawsuit, subpoena, summons, deposition, demand letter, cease and desist, or other litigation / legal dispute",
  "NDA — Standard": "a request to prepare a non-disclosure or confidentiality agreement (not a breach of one)",
  "Finance — Debt / Covenant": "loan, debt, covenant, credit facility, or financing agreement",
  "IP / Trademark / OSS": "patent, trademark, copyright, open-source licensing, or inventorship",
  "Privacy — DPIA / GDPR": "GDPR, DPIA, personal data, privacy, biometric or telemetry data handling",
  "Compliance — Sanctions": "sanctions, OFAC, embargoed country, or denied-party screening",
  "Regulatory — EU": "EU regulation, the AI Act, or a client-facing regulatory / compliance statement",
  "Vendor Contract": "a vendor / supplier MSA, SaaS or subscription contract, typically with a dollar value",
  "Vendor DD": "vendor due diligence, especially in a higher-risk jurisdiction",
  "General Inquiry": "anything else, a general legal question, or an unclear request",
};

/**
 * Classify an intake request with Laya. Returns the same shape as
 * `classifyIntakeRegex` (`{cat, priority, team, sla, slaHours, rule, conf,
 * risk, note, hrs, source:"laya"}`) or `null` when Laya is disabled,
 * unavailable, or not confident enough — so callers fall back to regex.
 *
 * @param {string} text  the request description
 * @param {string} [dept] the requester's department (added as context)
 * @param {object} [opts] {url, apiKey, timeout, minConfidence}
 */
export async function classifyIntakeLaya(text, dept, opts = {}) {
  const base = (opts.url || (typeof process !== "undefined" && process.env && process.env.LAYA_URL) || "").replace(/\/+$/, "");
  const body0 = (text || "").trim();
  if (!base || body0.length < 3) return null; // disabled or too short

  const payload = {
    state: { body: dept ? `[Department: ${dept}] ${body0}` : body0 },
    questions: {
      category: {
        type: "choice",
        instructions: "Classify this inbound legal request into the single best category for a corporate legal department's intake triage.",
        criteria: CRITERIA,
      },
    },
  };
  const headers = { "Content-Type": "application/json" };
  const key = opts.apiKey || (typeof process !== "undefined" && process.env && process.env.LAYA_API_KEY);
  if (key) headers.Authorization = `Bearer ${key}`;

  const timeout = opts.timeout ?? 4000;
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
  try {
    const resp = await fetch(`${base}/v1/systemone`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const ans = data && data.answers && data.answers.category;
    if (!ans || !ans.choice) return null;
    const cat = ans.choice;
    const conf = typeof ans.confidence === "number" ? ans.confidence : 0;
    const map = CATEGORY_MAP[cat];
    const minConfidence = opts.minConfidence ?? 0.55;
    // Low confidence or the catch-all "General Inquiry" → let regex / the
    // caller's default decide rather than force a weak Laya call through.
    if (!map || conf < minConfidence) return null;
    return {
      cat,
      priority: map.priority,
      team: map.team,
      sla: map.sla,
      slaHours: map.slaHours,
      rule: "LAYA",
      conf: Math.round(conf * 100),
      risk: map.risk,
      note: map.note,
      hrs: map.hrs,
      source: "laya",
    };
  } catch {
    return null; // network error / timeout / bad JSON → degrade to regex
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** True when a Laya endpoint is configured (server-side). */
export function isLayaConfigured() {
  return !!(typeof process !== "undefined" && process.env && process.env.LAYA_URL);
}
