/**
 * TriggerEventDialog — record or edit the hold's trigger event
 * (sub-PR 4c.4, Item 9).
 *
 * Required fields: occurredAt (defaults to today) + eventDescription
 * (free-text). On submit, POSTs (no existing trigger) or PUTs (edit
 * existing) to `/api/matter/[id]/holds/[holdId]/trigger-event`.
 *
 * The trigger event is the most important factual record in
 * defensibility (Rule 37(e), "when did duty attach"). The dialog
 * makes both initial recording and post-hoc edits explicit, with
 * the chain distinguishing TRIGGER_RECORDED from TRIGGER_UPDATED.
 */
import React, { useState } from "react";
import { C, F, M, useToast } from "@aegis/ui";
import { ModalShell } from "./ModalShell";

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

export interface TriggerEventDialogProps {
  matterId: string;
  holdId: string;
  /** Pre-fill values when editing an existing trigger event. */
  existing?: {
    triggerEventId: string;
    eventDescription: string;
    occurredAt: string;
  } | null;
  onClose: () => void;
  onSaved: () => void;
}

export const TriggerEventDialog: React.FC<TriggerEventDialogProps> = ({
  matterId,
  holdId,
  existing,
  onClose,
  onSaved,
}) => {
  const toast = useToast();
  const [description, setDescription] = useState(
    existing?.eventDescription ?? "",
  );
  const [occurredAt, setOccurredAt] = useState(
    existing?.occurredAt
      ? existing.occurredAt.slice(0, 10)
      : new Date().toISOString().slice(0, 10),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = description.trim().length > 0 && !!occurredAt && !submitting;

  async function submit() {
    if (!ready) return;
    setSubmitting(true);
    setError(null);
    try {
      const url = `/api/matter/${matterId}/holds/${holdId}/trigger-event`;
      const isEdit = !!existing;
      const body = {
        eventDescription: description.trim(),
        occurredAt: new Date(`${occurredAt}T00:00:00.000Z`).toISOString(),
        ...(existing ? { triggerEventId: existing.triggerEventId } : {}),
      };
      const r = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok && r.status !== 201) {
        throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      }
      toast.success(
        isEdit ? "Trigger event updated." : "Trigger event recorded.",
      );
      onSaved();
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
      ariaLabel={existing ? "Edit trigger event" : "Record trigger event"}
      title={existing ? "Edit trigger event" : "Record trigger event"}
      icon="▲"
      sub="Anchors when the duty to preserve attached. Per Rule 37(e), this is the most important factual record in defensibility."
      maxWidth={600}
    >
      <div
        style={{
          padding: 10,
          background: `${C.am}10`,
          border: `1px solid ${C.am}55`,
          borderRadius: 4,
          fontSize: 10.5,
          fontFamily: F,
          color: C.t2,
          lineHeight: 1.5,
          marginBottom: 12,
        }}
      >
        Record what happened and when it became reasonably anticipated. The
        chain distinguishes the initial recording from later edits — both are
        permanent.
      </div>

      <Field label="Trigger date">
        <input
          type="date"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          style={inputStyle}
          max={new Date().toISOString().slice(0, 10)}
        />
      </Field>

      <Field label="What happened (required)">
        <textarea
          value={description}
          autoFocus
          onChange={(e) => setDescription(e.target.value)}
          placeholder='e.g. "Receipt of preservation letter from Smith & Co. counsel re: contract dispute, served 2026-01-15."'
          rows={5}
          style={{
            ...inputStyle,
            fontFamily: F,
            fontSize: 11.5,
            resize: "vertical",
            minHeight: 100,
          }}
        />
      </Field>

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
          {submitting
            ? existing
              ? "Saving…"
              : "Recording…"
            : existing
              ? "Save changes"
              : "Record trigger"}
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
