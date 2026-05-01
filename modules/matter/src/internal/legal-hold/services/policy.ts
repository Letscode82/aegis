/**
 * Hold-policy resolution.
 *
 * Org-default policy lives on `OrganizationHoldPolicy`; per-hold
 * overrides live on `LegalHold.customPolicyJson`. `resolveEffectivePolicy`
 * is the only path callers should use — the DB shape is intentionally
 * not exposed.
 *
 * Issuance copies the merged result forward into
 * `LegalHold.customPolicyJson` so the hold is self-contained for
 * audit purposes (a future change to the org default cannot
 * retroactively shift what a sealed hold's policy was).
 */
import { prisma } from "@aegis/db";
import type { ResolvedHoldPolicy } from "../types";

export class HoldPolicyResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HoldPolicyResolutionError";
  }
}

const DEFAULT_POLICY: ResolvedHoldPolicy = {
  attestationCadenceDays: 90,
  reminderLeadTimeDays: 7,
  escalationChain: [
    { level: 1, afterDays: 7, notifyRoleNames: ["paralegal"] },
    { level: 2, afterDays: 14, notifyRoleNames: ["attorney"] },
    { level: 3, afterDays: 21, notifyRoleNames: ["gc"] },
  ],
  jurisdictionPolicies: {},
};

function readJsonObject(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function readEscalationChain(v: unknown): ResolvedHoldPolicy["escalationChain"] {
  if (!Array.isArray(v)) return DEFAULT_POLICY.escalationChain;
  return v
    .map((row) => {
      const o = readJsonObject(row);
      if (!o) return null;
      const level = typeof o.level === "number" ? o.level : null;
      const afterDays = typeof o.afterDays === "number" ? o.afterDays : null;
      const notifyRoleNames = Array.isArray(o.notifyRoleNames)
        ? (o.notifyRoleNames as unknown[]).filter(
            (s): s is string => typeof s === "string",
          )
        : [];
      if (level === null || afterDays === null) return null;
      return { level, afterDays, notifyRoleNames };
    })
    .filter((r): r is { level: number; afterDays: number; notifyRoleNames: string[] } => !!r);
}

function readJurisdictionPolicies(
  v: unknown,
): ResolvedHoldPolicy["jurisdictionPolicies"] {
  const obj = readJsonObject(v);
  if (!obj) return {};
  const out: ResolvedHoldPolicy["jurisdictionPolicies"] = {};
  for (const [k, raw] of Object.entries(obj)) {
    const r = readJsonObject(raw);
    if (!r) continue;
    const cadence = typeof r.cadenceDays === "number" ? r.cadenceDays : null;
    if (cadence === null) continue;
    out[k] = {
      cadenceDays: cadence,
      mandatoryLanguageMd:
        typeof r.mandatoryLanguageMd === "string"
          ? r.mandatoryLanguageMd
          : undefined,
    };
  }
  return out;
}

export async function getOrgHoldPolicy(
  organizationId: string,
): Promise<ResolvedHoldPolicy> {
  const row = await prisma.organizationHoldPolicy.findUnique({
    where: { organizationId },
  });
  if (!row) return DEFAULT_POLICY;
  return {
    attestationCadenceDays: row.defaultAttestationCadenceDays,
    reminderLeadTimeDays: row.reminderLeadTimeDays,
    escalationChain: readEscalationChain(row.escalationChainJson),
    jurisdictionPolicies: readJurisdictionPolicies(
      row.jurisdictionPoliciesJson,
    ),
  };
}

export async function updateOrgHoldPolicy(
  organizationId: string,
  policy: Partial<ResolvedHoldPolicy>,
): Promise<ResolvedHoldPolicy> {
  const current = await getOrgHoldPolicy(organizationId);
  const merged: ResolvedHoldPolicy = { ...current, ...policy };
  await prisma.organizationHoldPolicy.upsert({
    where: { organizationId },
    update: {
      defaultAttestationCadenceDays: merged.attestationCadenceDays,
      reminderLeadTimeDays: merged.reminderLeadTimeDays,
      escalationChainJson: merged.escalationChain as unknown as object,
      jurisdictionPoliciesJson: merged.jurisdictionPolicies as unknown as object,
    },
    create: {
      organizationId,
      defaultAttestationCadenceDays: merged.attestationCadenceDays,
      reminderLeadTimeDays: merged.reminderLeadTimeDays,
      escalationChainJson: merged.escalationChain as unknown as object,
      jurisdictionPoliciesJson: merged.jurisdictionPolicies as unknown as object,
    },
  });
  return merged;
}

/**
 * Effective policy for a specific hold = org default merged with any
 * `customPolicyJson` override on the hold row. When `customPolicyJson`
 * is unset (DRAFT holds typically), org default applies. When set
 * (post-issue), the snapshot on the hold is authoritative.
 */
export async function resolveEffectivePolicy(
  organizationId: string,
  holdId?: string,
): Promise<ResolvedHoldPolicy> {
  const orgPolicy = await getOrgHoldPolicy(organizationId);
  if (!holdId) return orgPolicy;
  const hold = await prisma.legalHold.findUnique({
    where: { id: holdId },
    select: { customPolicyJson: true },
  });
  if (!hold || !hold.customPolicyJson) return orgPolicy;
  const obj = readJsonObject(hold.customPolicyJson);
  if (!obj) return orgPolicy;
  return {
    attestationCadenceDays:
      typeof obj.attestationCadenceDays === "number"
        ? obj.attestationCadenceDays
        : orgPolicy.attestationCadenceDays,
    reminderLeadTimeDays:
      typeof obj.reminderLeadTimeDays === "number"
        ? obj.reminderLeadTimeDays
        : orgPolicy.reminderLeadTimeDays,
    escalationChain: Array.isArray(obj.escalationChain)
      ? readEscalationChain(obj.escalationChain)
      : orgPolicy.escalationChain,
    jurisdictionPolicies:
      readJsonObject(obj.jurisdictionPolicies) !== null
        ? readJurisdictionPolicies(obj.jurisdictionPolicies)
        : orgPolicy.jurisdictionPolicies,
  };
}

/**
 * For a hold's set of jurisdictions, compute the effective cadence —
 * shortest cadence among all jurisdictions on the hold, falling back
 * to the policy default. Schrems II / GDPR-type restrictions
 * produce shorter cadences which this helper surfaces deterministically.
 */
export function effectiveCadenceDays(
  policy: ResolvedHoldPolicy,
  jurisdictions: string[],
): number {
  const overrides = jurisdictions
    .map((j) => policy.jurisdictionPolicies[j]?.cadenceDays)
    .filter((c): c is number => typeof c === "number");
  if (overrides.length === 0) return policy.attestationCadenceDays;
  return Math.min(policy.attestationCadenceDays, ...overrides);
}
