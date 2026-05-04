/**
 * HoldPolicyEditor — admin page for the org-wide hold policy
 * (sub-PR 4c.4, Item 10).
 *
 * Edits OrganizationHoldPolicy:
 *   - default attestation cadence (days)
 *   - reminder lead time (days)
 *   - per-jurisdiction overrides: cadence + mandatory notice
 *     language + works-council flag
 *
 * GET /api/admin/legal-hold/policy → load
 * PUT /api/admin/legal-hold/policy → save
 *
 * Mounted at /admin/legal-hold/policy. Reached from the
 * jurisdiction popover's "Edit jurisdiction policy" link, or the
 * side-nav admin group.
 */
import React, { useEffect, useState } from "react";
import { Card, SH, C, F, M, useToast } from "@aegis/ui";

interface JurisdictionRow {
  code: string;
  cadenceDays: number;
  mandatoryLanguageMd: string;
  worksCouncilNotificationRequired: boolean;
}

interface PolicyDTO {
  attestationCadenceDays: number;
  reminderLeadTimeDays: number;
  escalationChain: unknown[];
  jurisdictionPolicies: Record<
    string,
    {
      cadenceDays: number;
      mandatoryLanguageMd?: string;
      worksCouncilNotificationRequired?: boolean;
    }
  >;
}

const inputStyle: React.CSSProperties = {
  background: C.s1,
  border: `1px solid ${C.br}`,
  padding: "6px 10px",
  borderRadius: 4,
  color: C.t1,
  fontFamily: M,
  fontSize: 11,
  outline: "none",
  width: "100%",
};

export const HoldPolicyEditor: React.FC = () => {
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const [defaultCadence, setDefaultCadence] = useState(90);
  const [reminderLead, setReminderLead] = useState(7);
  const [escalationChain, setEscalationChain] = useState<unknown[]>([]);
  const [rows, setRows] = useState<JurisdictionRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/legal-hold/policy")
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d: PolicyDTO) => {
        if (!alive) return;
        setDefaultCadence(d.attestationCadenceDays);
        setReminderLead(d.reminderLeadTimeDays);
        setEscalationChain(d.escalationChain ?? []);
        setRows(
          Object.entries(d.jurisdictionPolicies ?? {}).map(([code, p]) => ({
            code,
            cadenceDays: p.cadenceDays,
            mandatoryLanguageMd: p.mandatoryLanguageMd ?? "",
            worksCouncilNotificationRequired:
              !!p.worksCouncilNotificationRequired,
          })),
        );
        setLoaded(true);
      })
      .catch((e) => alive && toast.error(String(e)));
    return () => {
      alive = false;
    };
    // The toast handle is stable across renders via the provider's
    // `useMemo`; the load only needs to fire once at mount.
  }, []);

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        code: "",
        cadenceDays: defaultCadence,
        mandatoryLanguageMd: "",
        worksCouncilNotificationRequired: false,
      },
    ]);
  }

  function updateRow(idx: number, patch: Partial<JurisdictionRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function deleteRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    setSubmitting(true);
    try {
      const jurisdictionPolicies: PolicyDTO["jurisdictionPolicies"] = {};
      for (const r of rows) {
        const code = r.code.trim();
        if (!code) continue;
        jurisdictionPolicies[code] = {
          cadenceDays: r.cadenceDays,
          ...(r.mandatoryLanguageMd
            ? { mandatoryLanguageMd: r.mandatoryLanguageMd }
            : {}),
          ...(r.worksCouncilNotificationRequired
            ? { worksCouncilNotificationRequired: true }
            : {}),
        };
      }
      const body = {
        attestationCadenceDays: defaultCadence,
        reminderLeadTimeDays: reminderLead,
        escalationChain,
        jurisdictionPolicies,
      };
      const r = await fetch("/api/admin/legal-hold/policy", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      toast.success("Hold policy saved.");
    } catch (e) {
      toast.error(`Save failed: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (!loaded) {
    return (
      <div
        style={{
          color: C.t3,
          fontFamily: M,
          fontSize: 12,
          padding: 24,
        }}
      >
        Loading hold policy…
      </div>
    );
  }

  return (
    <div style={{ padding: 14, display: "grid", gap: 14, maxWidth: 960 }}>
      <Card>
        <SH
          icon="🛡"
          title="Legal hold policy"
          sub="Org-wide defaults. Each hold starts from these values; per-hold overrides are snapshotted at issuance."
        />

        <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            <Field label="Default attestation cadence (days)">
              <input
                type="number"
                min={1}
                max={365}
                value={defaultCadence}
                onChange={(e) =>
                  setDefaultCadence(parseInt(e.target.value || "0", 10))
                }
                style={inputStyle}
              />
            </Field>
            <Field label="Reminder lead time (days)">
              <input
                type="number"
                min={0}
                max={60}
                value={reminderLead}
                onChange={(e) =>
                  setReminderLead(parseInt(e.target.value || "0", 10))
                }
                style={inputStyle}
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <SH
            icon="🌐"
            title="Per-jurisdiction overrides"
            sub="Cadence + mandatory notice language + works-council notification flag."
          />
          <button
            type="button"
            onClick={addRow}
            style={{
              background: "transparent",
              border: `1px solid ${C.bl}55`,
              color: C.bl,
              padding: "5px 12px",
              borderRadius: 4,
              fontFamily: F,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            + Add jurisdiction
          </button>
        </div>

        {rows.length === 0 ? (
          <div
            style={{
              marginTop: 12,
              fontSize: 11,
              fontFamily: M,
              color: C.t3,
            }}
          >
            No per-jurisdiction overrides. Defaults apply to every hold.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {rows.map((r, i) => (
              <div
                key={i}
                style={{
                  border: `1px solid ${C.br}`,
                  borderRadius: 4,
                  padding: 10,
                  display: "grid",
                  gap: 8,
                  background: C.s1,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 200px 80px",
                    gap: 10,
                  }}
                >
                  <Field label="Jurisdiction code (e.g. EU-DE, US-CA)">
                    <input
                      value={r.code}
                      onChange={(e) =>
                        updateRow(i, { code: e.target.value.trim() })
                      }
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Cadence (days)">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={r.cadenceDays}
                      onChange={(e) =>
                        updateRow(i, {
                          cadenceDays: parseInt(e.target.value || "0", 10),
                        })
                      }
                      style={inputStyle}
                    />
                  </Field>
                  <button
                    type="button"
                    onClick={() => deleteRow(i)}
                    style={{
                      alignSelf: "end",
                      background: "transparent",
                      border: `1px solid ${C.rd}55`,
                      color: C.rd,
                      padding: "5px 10px",
                      borderRadius: 4,
                      fontFamily: F,
                      fontSize: 10.5,
                      cursor: "pointer",
                      letterSpacing: 0.3,
                    }}
                  >
                    Remove
                  </button>
                </div>
                <Field label="Mandatory notice language (markdown, optional)">
                  <textarea
                    value={r.mandatoryLanguageMd}
                    onChange={(e) =>
                      updateRow(i, { mandatoryLanguageMd: e.target.value })
                    }
                    rows={3}
                    style={{
                      ...inputStyle,
                      fontFamily: F,
                      resize: "vertical",
                      minHeight: 60,
                    }}
                  />
                </Field>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontFamily: F,
                    fontSize: 11,
                    color: C.t1,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={r.worksCouncilNotificationRequired}
                    onChange={(e) =>
                      updateRow(i, {
                        worksCouncilNotificationRequired: e.target.checked,
                      })
                    }
                  />
                  Works council notification required
                </label>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          type="button"
          onClick={save}
          disabled={submitting}
          style={{
            background: submitting ? C.br : C.bl,
            color: submitting ? C.t3 : C.bg,
            border: "none",
            padding: "8px 22px",
            borderRadius: 4,
            fontFamily: F,
            fontSize: 11.5,
            fontWeight: 700,
            cursor: submitting ? "wait" : "pointer",
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          {submitting ? "Saving…" : "Save policy"}
        </button>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <label style={{ display: "block" }}>
    <span
      style={{
        display: "block",
        fontFamily: F,
        fontSize: 9.5,
        color: C.t3,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        marginBottom: 4,
      }}
    >
      {label}
    </span>
    {children}
  </label>
);
