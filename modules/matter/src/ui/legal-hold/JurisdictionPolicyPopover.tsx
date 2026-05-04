/**
 * JurisdictionPolicyPopover — opens when the user clicks a
 * jurisdiction pill in the header strip (sub-PR 4c.4, Item 10).
 *
 * Renders via ModalShell since the body can grow tall (mandatory
 * notice language is markdown). Shows:
 *   - jurisdiction code + human label
 *   - effective cadence (the per-hold winning value, with a note
 *     about which jurisdiction's cadence dominates)
 *   - mandatory notice language for this jurisdiction (if any)
 *   - works council notification flag
 *   - GDPR right-to-erasure conflict warning when EU-* / DE / FR
 *     / etc. (heuristic — flag any code starting with "EU-" or
 *     matching a known GDPR-scope set)
 *   - Edit jurisdiction policy link → /admin/legal-hold/policy
 */
import React, { useEffect, useState } from "react";
import { C, F, M } from "@aegis/ui";
import { ModalShell } from "./ModalShell";

interface PolicyDTO {
  attestationCadenceDays: number;
  reminderLeadTimeDays: number;
  jurisdictionPolicies: Record<
    string,
    {
      cadenceDays: number;
      mandatoryLanguageMd?: string;
      worksCouncilNotificationRequired?: boolean;
    }
  >;
}

interface PolicyPayload {
  policy: PolicyDTO;
  holdJurisdictions: string[];
  effectiveCadenceDays: number;
}

const JURISDICTION_LABELS: Record<string, string> = {
  "US-CA": "California, USA",
  "US-NY": "New York, USA",
  "US-TX": "Texas, USA",
  "US-FL": "Florida, USA",
  "US-WA": "Washington, USA",
  EU: "European Union",
  "EU-DE": "Germany (EU)",
  "EU-FR": "France (EU)",
  "EU-IT": "Italy (EU)",
  "EU-NL": "Netherlands (EU)",
  UK: "United Kingdom",
  CA: "Canada",
  AU: "Australia",
  IN: "India",
  JP: "Japan",
  BR: "Brazil",
};

const GDPR_SCOPE = (code: string) =>
  code === "EU" ||
  code.startsWith("EU-") ||
  code === "UK" ||
  code === "CH"; // Schrems II / GDPR-equivalent regimes

export interface JurisdictionPolicyPopoverProps {
  matterId: string;
  holdId: string;
  jurisdictionCode: string;
  onClose: () => void;
}

export const JurisdictionPolicyPopover: React.FC<JurisdictionPolicyPopoverProps> = ({
  matterId,
  holdId,
  jurisdictionCode,
  onClose,
}) => {
  const [data, setData] = useState<PolicyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/matter/${matterId}/holds/${holdId}/policy`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d: PolicyPayload) => alive && setData(d))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [matterId, holdId]);

  const label = JURISDICTION_LABELS[jurisdictionCode] ?? jurisdictionCode;
  const jurPolicy = data?.policy.jurisdictionPolicies[jurisdictionCode];

  return (
    <ModalShell
      onClose={onClose}
      ariaLabel={`Policy detail for ${label}`}
      title={label}
      icon="🌐"
      sub={`${jurisdictionCode} · jurisdiction-specific hold policy`}
      maxWidth={600}
    >
      {error && (
        <div style={{ color: C.rd, fontSize: 11, fontFamily: M }}>{error}</div>
      )}
      {!data && !error && (
        <div style={{ color: C.t3, fontSize: 11, fontFamily: M }}>
          Loading policy…
        </div>
      )}
      {data && (
        <div style={{ display: "grid", gap: 14 }}>
          <SectionHeader text="Effective policy for this hold" />
          <Row
            label="Effective cadence"
            value={`${data.effectiveCadenceDays} day${data.effectiveCadenceDays === 1 ? "" : "s"}`}
            sub={
              data.effectiveCadenceDays !== data.policy.attestationCadenceDays
                ? `(shorter than the org default ${data.policy.attestationCadenceDays}d — a per-jurisdiction override wins on this hold)`
                : "(matches org default)"
            }
          />
          <Row
            label="Reminder lead time"
            value={`${data.policy.reminderLeadTimeDays} day${data.policy.reminderLeadTimeDays === 1 ? "" : "s"}`}
          />

          <SectionHeader text={`Detail for ${jurisdictionCode}`} />
          {jurPolicy ? (
            <>
              <Row
                label="Cadence override"
                value={`${jurPolicy.cadenceDays} day${jurPolicy.cadenceDays === 1 ? "" : "s"}`}
                sub={
                  jurPolicy.cadenceDays < data.policy.attestationCadenceDays
                    ? "Wins for any custodian in this jurisdiction."
                    : "Matches org default."
                }
              />
              {jurPolicy.worksCouncilNotificationRequired && (
                <Row
                  label="Works council"
                  value="Notification required"
                  sub="Inform the local works council before applying preservation actions."
                  warn
                />
              )}
              {jurPolicy.mandatoryLanguageMd && (
                <div>
                  <span
                    style={{
                      display: "block",
                      fontFamily: M,
                      fontSize: 9.5,
                      color: C.t3,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                      marginBottom: 6,
                    }}
                  >
                    Mandatory notice language
                  </span>
                  <pre
                    style={{
                      background: C.s1,
                      border: `1px solid ${C.br}`,
                      borderRadius: 4,
                      padding: 12,
                      fontFamily: M,
                      fontSize: 11,
                      color: C.t1,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      margin: 0,
                      maxHeight: 240,
                      overflowY: "auto",
                    }}
                  >
                    {jurPolicy.mandatoryLanguageMd}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                fontSize: 10.5,
                fontFamily: F,
                color: C.t3,
                fontStyle: "italic",
                lineHeight: 1.5,
              }}
            >
              No jurisdiction-specific policy configured. Using org defaults:
              cadence {data.policy.attestationCadenceDays}d, reminder lead{" "}
              {data.policy.reminderLeadTimeDays}d.
            </div>
          )}

          {GDPR_SCOPE(jurisdictionCode) && (
            <div
              style={{
                padding: 10,
                background: `${C.am}12`,
                border: `1px solid ${C.am}55`,
                borderLeft: `3px solid ${C.am}`,
                borderRadius: 4,
                fontSize: 10.5,
                fontFamily: F,
                color: C.t1,
                lineHeight: 1.5,
              }}
            >
              <span style={{ fontFamily: M, color: C.am, fontWeight: 700 }}>
                ⚠ GDPR right-to-erasure tension —
              </span>{" "}
              custodians in this jurisdiction may submit Article 17 erasure
              requests covering data the hold preserves. Document the
              preservation justification (Article 17(3)(e) — establishment of
              legal claims) before responding to any erasure request.
            </div>
          )}

          <div
            style={{
              borderTop: `1px solid ${C.br}`,
              paddingTop: 10,
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <a
              href="/admin/legal-hold/policy"
              style={{
                fontFamily: F,
                fontSize: 10.5,
                color: C.bl,
                textDecoration: "underline",
                letterSpacing: 0.3,
              }}
            >
              Edit jurisdiction policy →
            </a>
          </div>
        </div>
      )}
    </ModalShell>
  );
};

const SectionHeader: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      fontFamily: M,
      fontSize: 9.5,
      color: C.t3,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      borderBottom: `1px solid ${C.br}`,
      paddingBottom: 4,
      marginBottom: -4,
    }}
  >
    {text}
  </div>
);

const Row: React.FC<{
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}> = ({ label, value, sub, warn }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "180px 1fr",
      gap: 12,
      fontSize: 11.5,
      fontFamily: F,
    }}
  >
    <span
      style={{
        fontFamily: M,
        fontSize: 10,
        color: C.t3,
        letterSpacing: 0.4,
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
    <span style={{ color: warn ? C.am : C.t1 }}>
      <span style={{ fontWeight: warn ? 600 : 500 }}>{value}</span>
      {sub && (
        <div
          style={{
            fontSize: 10,
            color: C.t3,
            marginTop: 1,
            lineHeight: 1.4,
          }}
        >
          {sub}
        </div>
      )}
    </span>
  </div>
);
