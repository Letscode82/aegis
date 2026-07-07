/**
 * The governance workflow library — 10 pharma-GC ladders, ported from
 * the assessed engine's library (docs/workflow-engine-assessment.md)
 * and adapted to AEGIS:
 *
 * - approverRole values are the platform's canonical role names
 *   (@aegis/auth RoleName) — the original's org-chart roles map onto
 *   the 8-role catalog (regulatory/privacy/employment counsel →
 *   attorney; compliance/quality/CS functions → legal_ops; GC-level
 *   sign-offs → gc).
 * - AGENT steps bind agentKey to the intake module's registered agent
 *   ids (the 11-agent registry). Runs surface FINDINGS to the human
 *   approver; they never advance the ladder (see agent-tasks.ts).
 *
 * Grounded in what a pharma GC office actually handles: Hatch-Waxman
 * 45-day statutory windows, settlement antitrust review, the DPDP
 * 72-hour breach clock, sanctions/debarment screening, UCPMP
 * investigations, POSH timelines, board/secretarial approvals.
 *
 * Seeding is idempotent — defineWorkflow upserts on (org, key).
 */
import { defineWorkflow, type DefineWorkflowInput } from "./engine";

type LadderSpec = Omit<DefineWorkflowInput, "organizationId">;

const h = (
  stepOrder: number,
  name: string,
  screenKey: string,
  approverRole: string | null,
  slaHours?: number,
  skipIf?: { field: string; op: string; value: unknown },
): LadderSpec["steps"][number] => ({
  stepOrder,
  name,
  screenKey,
  approverRole,
  kind: "HUMAN",
  slaHours: slaHours ?? null,
  metadataJson: skipIf ? { skip_if: skipIf } : {},
});

const a = (
  stepOrder: number,
  name: string,
  approverRole: string,
  agentKey: string,
  minConfidence: number,
  slaHours?: number,
): LadderSpec["steps"][number] => ({
  stepOrder,
  name,
  screenKey: "agent_review",
  approverRole,
  kind: "AGENT",
  agentConfigJson: { agentKey, minConfidence },
  slaHours: slaHours ?? null,
});

export const GOVERNANCE_LIBRARY: LadderSpec[] = [
  {
    key: "nda_fasttrack",
    name: "NDA Fast-Track",
    description:
      "Mutual/one-way NDAs. The NDA agent reviews against the standard template; only deviations need lawyer attention.",
    steps: [
      h(1, "Request & Upload", "nda_intake", "requester"),
      a(2, "AI Template Review", "attorney", "nda-agent", 0.75, 4),
      h(3, "Legal Sign-off", "legal_review", "attorney", 24),
      h(4, "E-Signature", "signature_screen", "gc", 48),
    ],
  },
  {
    key: "clm_contract_approval",
    name: "Contract Approval Ladder",
    description: "Commercial contracts: supply, distribution, licensing, services.",
    steps: [
      h(1, "Draft & Submit", "contract_draft", "requester"),
      a(2, "AI Risk Review", "attorney", "contract-review-agent", 0.8, 8),
      h(3, "Legal Review", "legal_review", "attorney", 48),
      h(4, "Finance Review", "finance_review", "legal_ops", 48, {
        field: "contract_value",
        op: "lt",
        value: 10000,
      }),
      h(5, "GC Approval", "gc_approval", "gc", 72),
      h(6, "Counter-signature", "signature_screen", "gc", 72),
    ],
  },
  {
    key: "patent_litigation",
    name: "Patent / ANDA Litigation (Para IV)",
    description:
      "Hatch-Waxman: the 45-day statutory window to sue after a Para IV notice makes early stages hard-SLA'd. Settlements require antitrust review before GC sign-off.",
    steps: [
      h(1, "Matter Intake & Docketing", "litigation_intake", "paralegal", 24),
      a(2, "AI Case Summary & Deadline Extraction", "attorney", "litigation-agent", 0.7, 8),
      h(3, "IP Counsel Assessment", "ip_assessment", "attorney", 120),
      h(4, "Outside Counsel Engagement", "counsel_engagement", "attorney", 168, {
        field: "handled_inhouse",
        op: "eq",
        value: true,
      }),
      h(5, "Strategy & Budget Approval", "gc_approval", "gc", 120),
      h(6, "Settlement Antitrust Review", "antitrust_review", "attorney", 168, {
        field: "settlement_proposed",
        op: "eq",
        value: false,
      }),
      h(7, "GC / Board Sign-off", "board_signoff", "gc", 120),
    ],
  },
  {
    key: "legal_notice",
    name: "Legal Notice Response",
    description:
      "Statutory / demand notices with hard reply deadlines. The Notice agent extracts every deadline with its source cited; counsel finalizes.",
    steps: [
      h(1, "Notice Logging", "notice_intake", "legal_ops", 8),
      a(2, "AI Deadline & Claim Extraction", "attorney", "notice-mgmt-agent", 0.75, 4),
      h(3, "Response Drafting", "response_draft", "attorney", 72),
      h(4, "GC Approval & Dispatch", "gc_approval", "gc", 48),
    ],
  },
  {
    key: "regulatory_response",
    name: "Regulatory Action Response",
    description:
      "USFDA 483 / warning letters, NPPA-DPCO pricing notices, state drug-controller actions. Cross-functional with Quality/Regulatory Affairs.",
    steps: [
      h(1, "Action Logging & Classification", "regulatory_intake", "legal_ops", 8),
      h(2, "Cross-functional Assessment", "cfa_review", "legal_ops", 72),
      h(3, "Legal Position & Draft Response", "legal_review", "attorney", 120),
      h(4, "GC Approval", "gc_approval", "gc", 48),
      h(5, "Board / Disclosure Review", "board_signoff", "legal_ops", 48, {
        field: "material",
        op: "eq",
        value: false,
      }),
    ],
  },
  {
    key: "vendor_onboarding",
    name: "Vendor / Counterparty Due Diligence",
    description:
      "Third-party onboarding: the Vendor agent runs sanctions/debarment screening; compliance clears exceptions.",
    steps: [
      h(1, "Vendor Details & Documents", "vendor_intake", "requester"),
      a(2, "AI Sanctions & Debarment Screening", "legal_ops", "vendor-intake-agent", 0.85, 8),
      h(3, "Compliance Clearance", "compliance_review", "legal_ops", 72),
      h(4, "Contract Terms Approval", "legal_review", "attorney", 72),
    ],
  },
  {
    key: "compliance_investigation",
    name: "Compliance Investigation",
    description:
      "Whistleblower / UCPMP / anti-bribery matters. Confidential track with mandatory closure report.",
    steps: [
      h(1, "Complaint Triage", "investigation_intake", "legal_ops", 48),
      h(2, "Investigation Plan Approval", "investigation_plan", "gc", 72),
      h(3, "Fact-finding & Interviews", "investigation_work", "attorney", 336),
      h(4, "Findings & Recommendation", "findings_review", "legal_ops", 120),
      h(5, "GC / Audit Committee Closure", "board_signoff", "gc", 120),
    ],
  },
  {
    key: "data_breach",
    name: "Data Privacy Incident (DPDP)",
    description:
      "Personal-data breach response. The 72-hour notification clock makes the first stages the tightest SLAs in the library.",
    steps: [
      h(1, "Incident Logging", "breach_intake", "legal_ops", 4),
      a(2, "AI Severity & Notification Assessment", "legal_ops", "privacy-assessment-agent", 0.85, 4),
      h(3, "Containment & Legal Position", "legal_review", "attorney", 24),
      h(4, "Regulator / Data-Principal Notification", "notification_dispatch", "gc", 36),
    ],
  },
  {
    key: "employment_matter",
    name: "Employment / POSH Matter",
    description: "Disciplinary, separation and POSH-committee matters with statutory timelines.",
    steps: [
      h(1, "Matter Intake", "hr_intake", "requester", 48),
      h(2, "Legal Assessment", "legal_review", "attorney", 96),
      h(3, "Committee / HR Head Decision", "committee_review", "legal_ops", 168),
      h(4, "GC Sign-off", "gc_approval", "gc", 72),
    ],
  },
  {
    key: "board_approval",
    name: "Board / Secretarial Approval",
    description: "POAs, authorised-signatory changes, disclosures and resolutions.",
    steps: [
      h(1, "Request & Draft Resolution", "secretarial_intake", "legal_ops", 72),
      h(2, "Legal Vetting", "legal_review", "attorney", 72),
      h(3, "CS / Board Approval", "board_signoff", "gc", 168),
    ],
  },
];

/**
 * Idempotently seed the 10-ladder library for an organization.
 * Returns the definition keys seeded. Safe to call repeatedly —
 * defineWorkflow upserts on (org, key); running instances keep their
 * step rows by id.
 */
export async function seedWorkflowLibrary(organizationId: string): Promise<string[]> {
  const keys: string[] = [];
  for (const spec of GOVERNANCE_LIBRARY) {
    await defineWorkflow({ organizationId, ...spec });
    keys.push(spec.key);
  }
  return keys;
}
