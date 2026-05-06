/**
 * SaveViewDialog — captures the current filter state as a new
 * saved view. Optional shared toggle + default toggle (sub-PR
 * 4c.5, Item 16).
 */
import React, { useState } from "react";
import { C, F, M, useToast } from "@aegis/ui";
import { ModalShell } from "./ModalShell";
import type { SavedViewDTO } from "./SavedViewsDropdown";

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

export interface SaveViewDialogProps {
  scope: string;
  filterState: unknown;
  onClose: () => void;
  onSaved: (view: SavedViewDTO) => void;
}

export const SaveViewDialog: React.FC<SaveViewDialogProps> = ({
  scope,
  filterState,
  onClose,
  onSaved,
}) => {
  const toast = useToast();
  const [name, setName] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const ready = name.trim().length > 0 && !submitting;

  async function submit() {
    if (!ready) return;
    setSubmitting(true);
    try {
      const r = await fetch("/api/saved-views", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope,
          name: name.trim(),
          filterState,
          isShared,
          isDefault,
        }),
      });
      if (!r.ok && r.status !== 201) {
        throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      }
      const created = (await r.json()) as SavedViewDTO;
      onSaved(created);
    } catch (e) {
      toast.error(`Save view failed: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      onClose={onClose}
      ariaLabel="Save view"
      title="Save current view"
      icon="💾"
      sub="Captures the active filters + sort so you can return to this view in one click."
      maxWidth={500}
    >
      <Field label="View name (required)">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='e.g. "My overdue review"'
          style={inputStyle}
        />
      </Field>

      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          fontFamily: F,
          fontSize: 11,
          color: C.t1,
          marginBottom: 8,
          cursor: "pointer",
          lineHeight: 1.4,
        }}
      >
        <input
          type="checkbox"
          checked={isShared}
          onChange={(e) => setIsShared(e.target.checked)}
        />
        <span>
          <span style={{ fontWeight: 600 }}>Share with my org</span>
          <div style={{ fontSize: 10, color: C.t3 }}>
            Other users in your organization will see this view in their
            {`"Shared views"`} list.
          </div>
        </span>
      </label>

      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          fontFamily: F,
          fontSize: 11,
          color: C.t1,
          cursor: "pointer",
          lineHeight: 1.4,
        }}
      >
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
        />
        <span>
          <span style={{ fontWeight: 600 }}>Set as my default</span>
          <div style={{ fontSize: 10, color: C.t3 }}>
            This view auto-applies whenever you open this surface.
            Replaces any existing default.
          </div>
        </span>
      </label>

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
          {submitting ? "Saving…" : "Save view"}
        </button>
      </div>
    </ModalShell>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <label style={{ display: "block", marginBottom: 12 }}>
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
