/**
 * Step 4 — Notice (sub-PR 4d.0).
 *
 * Picks the notice template (auto-suggests a jurisdiction match if
 * one exists, otherwise the default English template), lets counsel
 * opt individuals out of receiving the notice, and renders a live
 * preview pane with template variables substituted from the first
 * selected custodian's data.
 *
 * The reminder cadence default flows from the org's
 * `OrganizationHoldPolicy` — we don't fetch it here (the cadence
 * isn't required to issue) but Step 5 displays whatever value the
 * counsel ticks.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Pill, SH, C, F, M } from "@aegis/ui";
import type { WizardStepProps } from "./types";

interface NoticeTemplateRow {
  id: string;
  name: string;
  jurisdictionKey: string | null;
  bodyMarkdown: string;
  version: number;
  isActive: boolean;
}

const VAR_PATTERN = /\{\{\s*([a-zA-Z][a-zA-Z0-9.]*)\s*\}\}/g;

function renderPreview(
  body: string,
  ctx: Record<string, unknown>,
): string {
  return body.replace(VAR_PATTERN, (_full, path: string) => {
    const segments = path.split(".");
    let cur: unknown = ctx;
    for (const seg of segments) {
      if (cur && typeof cur === "object" && seg in (cur as object)) {
        cur = (cur as Record<string, unknown>)[seg];
      } else {
        return "(unset)";
      }
    }
    if (Array.isArray(cur)) return cur.join(", ");
    return cur === null || cur === undefined ? "(unset)" : String(cur);
  });
}

export const Step4Notice: React.FC<WizardStepProps> = ({
  state,
  update,
  onValid,
}) => {
  const [templates, setTemplates] = useState<NoticeTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/legal-hold/notice-templates")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: NoticeTemplateRow[]) => {
        setTemplates(rows.filter((t) => t.isActive));
        setLoading(false);
      })
      .catch(() => {
        setTemplates([]);
        setLoading(false);
      });
  }, []);

  // Auto-select the best template once the list is loaded — prefer
  // a jurisdiction match, fall back to the default (jurisdictionKey
  // = null), final fallback is the first active row.
  useEffect(() => {
    if (state.noticeTemplateId || templates.length === 0) return;
    const jurisdictionMatch = templates.find((t) =>
      t.jurisdictionKey ? state.jurisdictions.includes(t.jurisdictionKey) : false,
    );
    const defaultTpl = templates.find((t) => !t.jurisdictionKey);
    update({
      noticeTemplateId:
        jurisdictionMatch?.id ?? defaultTpl?.id ?? templates[0]!.id,
    });
  }, [templates, state.noticeTemplateId, state.jurisdictions, update]);

  // Default recipients to every selected custodian.
  useEffect(() => {
    if (
      state.noticeRecipients.length === 0 &&
      state.selectedCustodians.length > 0
    ) {
      update({
        noticeRecipients: state.selectedCustodians.map((c) => c.id),
      });
    }
  }, [state.selectedCustodians, state.noticeRecipients.length, update]);

  useEffect(() => {
    onValid(
      !!state.noticeTemplateId && state.noticeRecipients.length > 0,
    );
  }, [state.noticeTemplateId, state.noticeRecipients, onValid]);

  function toggleRecipient(id: string) {
    const set = new Set(state.noticeRecipients);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    update({ noticeRecipients: Array.from(set) });
  }

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === state.noticeTemplateId) ?? null,
    [templates, state.noticeTemplateId],
  );

  const previewCustodian = state.selectedCustodians[0];
  const previewBody = useMemo(() => {
    if (!selectedTemplate || !previewCustodian) return "";
    return renderPreview(selectedTemplate.bodyMarkdown, {
      custodian: {
        name: previewCustodian.name,
        email: previewCustodian.email,
        role: "(role)",
      },
      matter: {
        title: state.holdName,
        matterNumber: "(matter number)",
        jurisdictions: state.jurisdictions,
      },
      hold: {
        title: state.holdName,
        holdNumber: "(holdNumber)",
        scopeDescription: state.scopeMarkdown.split("\n")[0],
        triggeredAt: state.triggeredAt,
      },
      org: { name: "Your organization" },
      notice: {
        acknowledgmentLink: "https://your-domain.example/acknowledge",
      },
    });
  }, [
    selectedTemplate,
    previewCustodian,
    state.holdName,
    state.jurisdictions,
    state.scopeMarkdown,
    state.triggeredAt,
  ]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
      <div style={{ display: "grid", gap: 14 }}>
        <SH icon="✉" title="Notice" sub="Tell custodians about the hold." />

        <div>
          <Label text="Template" required />
          {loading ? (
            <div style={{ fontSize: 11, color: C.t3 }}>Loading…</div>
          ) : templates.length === 0 ? (
            <div style={{ fontSize: 11, color: C.am }}>
              No active notice templates. Configure at{" "}
              <a
                href="/admin/legal-hold/notice-templates"
                style={{ color: C.bl }}
              >
                /admin/legal-hold/notice-templates
              </a>
              .
            </div>
          ) : (
            <select
              value={state.noticeTemplateId ?? ""}
              onChange={(e) => update({ noticeTemplateId: e.target.value })}
              style={inputStyle()}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.jurisdictionKey ? `(${t.jurisdictionKey})` : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <Label text="Recipients" required />
          <div
            style={{
              border: `1px solid ${C.brL}`,
              background: C.s1,
              borderRadius: 4,
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            {state.selectedCustodians.map((c) => (
              <label
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderBottom: `1px solid ${C.brL}`,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={state.noticeRecipients.includes(c.id)}
                  onChange={() => toggleRecipient(c.id)}
                />
                <span style={{ flex: 1 }}>{c.name}</span>
                <span style={{ fontSize: 10, color: C.t3, fontFamily: M }}>
                  {c.email}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <Label text="Send schedule" />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => update({ noticeSendAt: null })}
              style={{
                ...chipStyle(state.noticeSendAt === null),
                flex: "0 0 auto",
              }}
            >
              Send now
            </button>
            <input
              type="datetime-local"
              value={state.noticeSendAt ?? ""}
              onChange={(e) => update({ noticeSendAt: e.target.value || null })}
              style={inputStyle()}
            />
          </div>
        </div>

        <div>
          <Label text="Reminder cadence (days)" />
          <input
            type="number"
            min={1}
            max={365}
            value={state.reminderCadenceDays ?? ""}
            onChange={(e) =>
              update({
                reminderCadenceDays: e.target.value
                  ? Number(e.target.value)
                  : null,
              })
            }
            placeholder="(use jurisdiction default)"
            style={inputStyle()}
          />
        </div>
      </div>

      <aside
        style={{
          padding: 12,
          background: C.cd,
          border: `1px solid ${C.brL}`,
          borderRadius: 4,
          alignSelf: "start",
          display: "grid",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontFamily: M,
              fontSize: 9.5,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: C.t3,
            }}
          >
            Live preview
          </div>
          {selectedTemplate && (
            <Pill t={`v${selectedTemplate.version}`} c={C.bl} />
          )}
        </div>
        {!selectedTemplate ? (
          <div style={{ fontSize: 11, color: C.t3 }}>
            Pick a template to preview the notice body.
          </div>
        ) : !previewCustodian ? (
          <div style={{ fontSize: 11, color: C.t3 }}>
            Add a custodian in Step 2 to see preview substitutions.
          </div>
        ) : (
          <pre
            style={{
              fontFamily: M,
              fontSize: 11,
              lineHeight: 1.5,
              color: C.t1,
              whiteSpace: "pre-wrap",
              maxHeight: 480,
              overflowY: "auto",
              margin: 0,
            }}
          >
            {previewBody}
          </pre>
        )}
      </aside>
    </div>
  );
};

const Label: React.FC<{ text: string; required?: boolean }> = ({
  text,
  required,
}) => (
  <div
    style={{
      fontFamily: M,
      fontSize: 9.5,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      color: C.t3,
      marginBottom: 4,
    }}
  >
    {text}
    {required && <span style={{ color: C.rd, marginLeft: 4 }}>*</span>}
  </div>
);

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 4,
    border: `1px solid ${C.brL}`,
    background: C.s1,
    color: C.t1,
    fontFamily: F,
    fontSize: 12,
    outline: "none",
  };
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "8px 14px",
    borderRadius: 4,
    border: `1px solid ${active ? C.bl : C.brL}`,
    background: active ? C.bl : "transparent",
    color: active ? C.bg : C.t1,
    fontFamily: F,
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
  };
}
