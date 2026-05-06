/**
 * Shared types for the Hold Wizard (sub-PR 4d.0).
 *
 * The shell carries the cross-step state through these shapes;
 * each step component reads its slice and reports updates via the
 * `update` callback. Auto-save serialises the whole `WizardState`
 * to localStorage keyed by matterId so closing the browser
 * mid-flow doesn't lose work.
 */

export interface PersonOption {
  id: string;
  name: string;
  email: string;
  department?: string | null;
}

export interface DiscoveredDataSource {
  /** Type maps to the DataSourceType enum on the backend. */
  type: string;
  externalIdentifier: string;
  displayLabel: string;
  retentionPolicyConflict: boolean;
  /** Selected by default after discovery; counsel can untick. */
  selected: boolean;
}

export interface DiscoveredSharePointSite {
  webUrl: string;
  displayName: string;
  siteType: "personal" | "team" | "communication";
  estimatedSize?: string;
  recommended: boolean;
  rationale?: string;
  selected: boolean;
}

export interface CustodianDiscovery {
  personId: string;
  status: "pending" | "succeeded" | "failed" | "skipped";
  errorMessage?: string;
  sources: DiscoveredDataSource[];
  sharePointSites: DiscoveredSharePointSite[];
}

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export interface WizardState {
  // ── Step 1 — Scope & Trigger ──
  holdName: string;
  triggerEventDescription: string;
  triggeredAt: string; // ISO date string
  jurisdictions: string[];
  scopeTemplateId: string | null;
  scopeMarkdown: string;

  // ── Step 2 — Custodians ──
  selectedCustodians: PersonOption[];

  // ── Step 3 — Data Sources ──
  discoveryByCustodian: Record<string, CustodianDiscovery>;
  /** "Skip auto-discovery, I'll add sources manually" — bypasses the
   *  Graph fetch in Step 3 entirely. */
  skipAutoDiscovery: boolean;

  // ── Step 4 — Notice ──
  noticeTemplateId: string | null;
  noticeRecipients: string[];
  noticeSendAt: string | null; // ISO datetime, null = "Now"
  reminderCadenceDays: number | null;

  // ── Cross-step / persistence ──
  /** Persisted DRAFT hold id once Step 1 + Step 2 are committed. */
  draftHoldId: string | null;
  /** Last step the wizard reached; resumed on re-open. */
  furthestStep: WizardStep;
}

export const EMPTY_WIZARD_STATE: WizardState = {
  holdName: "",
  triggerEventDescription: "Anticipated litigation",
  triggeredAt: new Date().toISOString().slice(0, 10),
  jurisdictions: [],
  scopeTemplateId: null,
  scopeMarkdown: "",
  selectedCustodians: [],
  discoveryByCustodian: {},
  skipAutoDiscovery: false,
  noticeTemplateId: null,
  noticeRecipients: [],
  noticeSendAt: null,
  reminderCadenceDays: null,
  draftHoldId: null,
  furthestStep: 1,
};

export interface WizardStepProps {
  matterId: string;
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  /** Calls back when the step's validation passes; the shell uses
   *  this to enable the Next button. */
  onValid: (valid: boolean) => void;
}
