/**
 * Step 1 — Scope & Trigger (sub-PR 4d.0).
 *
 * Captures the hold name, trigger event, jurisdictions, and scope
 * markdown. Scope templates from the existing 4c.4 admin surface
 * pre-fill the markdown when selected.
 */
import React, { useEffect, useState } from "react";
import { SH, C, F, M } from "@aegis/ui";
import type { WizardStepProps } from "./types";

interface ScopeTemplate {
  id: string;
  name: string;
  description: string | null;
  scopeMarkdown: string;
  defaultJurisdictions: string[];
}

const COMMON_JURISDICTIONS = [
  "US-CA",
  "US-NY",
  "US-FED",
  "EU",
  "EU-DE",
  "UK",
  "CA-ON",
];

export const Step1Scope: React.FC<WizardStepProps> = ({
  state,
  update,
  onValid,
}) => {
  const [templates, setTemplates] = useState<ScopeTemplate[]>([]);

  useEffect(() => {
    fetch("/api/admin/legal-hold/templates")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ScopeTemplate[]) => setTemplates(rows))
      .catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    onValid(
      state.holdName.trim().length > 0 &&
        state.jurisdictions.length > 0 &&
        state.scopeMarkdown.trim().length > 0,
    );
  }, [state.holdName, state.jurisdictions, state.scopeMarkdown, onValid]);

  function applyTemplate(id: string) {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) {
      update({ scopeTemplateId: null });
      return;
    }
    update({
      scopeTemplateId: id,
      scopeMarkdown: tpl.scopeMarkdown,
      jurisdictions:
        state.jurisdictions.length > 0
          ? state.jurisdictions
          : tpl.defaultJurisdictions,
    });
  }

  function toggleJurisdiction(code: string) {
    const set = new Set(state.jurisdictions);
    if (set.has(code)) set.delete(code);
    else set.add(code);
    update({ jurisdictions: Array.from(set) });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 24 }}>
      <div style={{ display: "grid", gap: 14 }}>
        <SH icon="📐" title="Scope & trigger" sub="What is this hold about?" />

        <div>
          <Label text="Hold name" required />
          <input
            value={state.holdName}
            onChange={(e) => update({ holdName: e.target.value })}
            placeholder="e.g. Snowflake MSA Litigation"
            style={inputStyle()}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <Label text="Trigger event" />
            <input
              value={state.triggerEventDescription}
              onChange={(e) =>
                update({ triggerEventDescription: e.target.value })
              }
              placeholder="Anticipated litigation"
              style={inputStyle()}
            />
          </div>
          <div>
            <Label text="Trigger date" />
            <input
              type="date"
              value={state.triggeredAt}
              onChange={(e) => update({ triggeredAt: e.target.value })}
              style={inputStyle()}
            />
          </div>
        </div>

        <div>
          <Label text="Jurisdictions" required />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {COMMON_JURISDICTIONS.map((code) => {
              const active = state.jurisdictions.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggleJurisdiction(code)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: `1px solid ${active ? C.bl : C.brL}`,
                    background: active ? C.bl : "transparent",
                    color: active ? C.bg : C.t1,
                    fontFamily: M,
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  {code}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label text="Scope template" />
          <select
            value={state.scopeTemplateId ?? ""}
            onChange={(e) => applyTemplate(e.target.value)}
            style={inputStyle()}
          >
            <option value="">(no template)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label text="Scope language" required />
          <textarea
            value={state.scopeMarkdown}
            onChange={(e) => update({ scopeMarkdown: e.target.value })}
            placeholder="Describe the documents, communications, and data subject to this hold."
            rows={6}
            style={{ ...inputStyle(), fontFamily: M, lineHeight: 1.5 }}
          />
        </div>
      </div>

      <aside
        style={{
          padding: 12,
          background: C.s1,
          border: `1px solid ${C.brL}`,
          borderRadius: 4,
          fontSize: 11,
          color: C.t2,
          alignSelf: "start",
          lineHeight: 1.5,
        }}
      >
        <div
          style={{
            fontFamily: M,
            fontSize: 9.5,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: C.t3,
            marginBottom: 6,
          }}
        >
          Why these defaults?
        </div>
        Jurisdictions inherit from the matter; you can override per
        hold. Scope templates fast-fill common language patterns —
        they're admin-managed at <code>/admin/legal-hold/templates</code>.
        <br />
        <br />
        The trigger date and description seed the trigger-event audit
        row when this hold issues. Counsel can edit the trigger later
        from the hold workspace.
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
