/**
 * SaveAsScopeTemplateDialog — captures the in-progress scope from
 * the create-hold form as a new HoldScopeTemplate (sub-PR 4c.4,
 * Item 12). Used both from the create-hold "Save current as
 * template" link and from the templates admin page.
 */
import React, { useState } from "react";
import { C, F, M, useToast } from "@aegis/ui";
import { ModalShell } from "./ModalShell";

interface SavedTemplate {
  id: string;
  name: string;
  description: string | null;
  scopeMarkdown: string;
  defaultJurisdictions: string[];
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

export interface SaveAsScopeTemplateDialogProps {
  scopeMarkdown: string;
  defaultJurisdictions: string[];
  onClose: () => void;
  onSaved: (template: SavedTemplate) => void;
}

export const SaveAsScopeTemplateDialog: React.FC<SaveAsScopeTemplateDialogProps> = ({
  scopeMarkdown,
  defaultJurisdictions,
  onClose,
  onSaved,
}) => {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = name.trim().length > 0 && !submitting;

  async function submit() {
    if (!ready) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/legal-hold/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          scopeMarkdown,
          defaultJurisdictions,
        }),
      });
      if (!r.ok && r.status !== 201) {
        throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      }
      const t = (await r.json()) as SavedTemplate;
      toast.success(`Saved scope template "${t.name}".`);
      onSaved(t);
    } catch (e) {
      setError(String(e));
      toast.error(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      onClose={onClose}
      ariaLabel="Save scope as template"
      title="Save scope as template"
      icon="📋"
      sub="Captures the current scope language and default jurisdictions for re-use on future holds."
      maxWidth={560}
    >
      <Field label="Template name (required)">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='e.g. "Trade-secret IP litigation"'
          style={inputStyle}
        />
      </Field>
      <Field label="Description (optional)">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short hint for the dropdown"
          style={inputStyle}
        />
      </Field>

      <div
        style={{
          marginTop: 6,
          padding: 10,
          background: C.s1,
          border: `1px solid ${C.br}`,
          borderRadius: 4,
          fontFamily: F,
          fontSize: 10.5,
          color: C.t2,
        }}
      >
        <div
          style={{
            fontFamily: M,
            fontSize: 9.5,
            color: C.t3,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            marginBottom: 4,
          }}
        >
          Captured scope
        </div>
        <div
          style={{
            whiteSpace: "pre-wrap",
            color: C.t1,
            maxHeight: 140,
            overflowY: "auto",
            lineHeight: 1.4,
          }}
        >
          {scopeMarkdown.length > 0
            ? scopeMarkdown
            : "(no scope captured — fill the scope field first)"}
        </div>
        {defaultJurisdictions.length > 0 && (
          <div
            style={{
              marginTop: 6,
              fontFamily: M,
              fontSize: 9.5,
              color: C.t3,
            }}
          >
            Default jurisdictions: {defaultJurisdictions.join(", ")}
          </div>
        )}
      </div>

      {error && (
        <div
          style={{
            marginTop: 10,
            padding: 8,
            border: `1px solid ${C.rd}`,
            background: C.rdG,
            color: C.rd,
            fontSize: 10.5,
            fontFamily: M,
            borderRadius: 4,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          marginTop: 14,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          style={{
            background: "transparent",
            border: `1px solid ${C.br}`,
            color: C.t1,
            padding: "7px 14px",
            borderRadius: 4,
            cursor: submitting ? "wait" : "pointer",
            fontFamily: F,
            fontSize: 11,
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!ready}
          style={{
            background: ready ? C.bl : C.br,
            color: ready ? C.bg : C.t3,
            border: "none",
            padding: "7px 18px",
            borderRadius: 4,
            cursor: ready ? "pointer" : "default",
            fontFamily: F,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          {submitting ? "Saving…" : "Save template"}
        </button>
      </div>
    </ModalShell>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <label style={{ display: "block", marginBottom: 10 }}>
    <span
      style={{
        display: "block",
        fontFamily: F,
        fontSize: 10,
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
