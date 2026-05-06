/**
 * MarkAcknowledgedDialog — admin-on-behalf acknowledgment (4c.3,
 * Item 2). Captures a required reason and an optional witness name
 * before flipping the custodian's `acknowledgedAt`.
 *
 * Renders via ModalShell. Permission gate is enforced server-side
 * (`matter:legal_hold:issue`); the dialog renders behind the
 * "Mark acknowledged on behalf" button which itself gates on
 * `canMutate`.
 */
import React, { useState } from "react";
import { C, F, M } from "@aegis/ui";
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

export interface MarkAcknowledgedDialogProps {
  matterId: string;
  holdId: string;
  custodianPersonId: string;
  custodianName: string;
  onClose: () => void;
  onMarked: () => void;
}

export const MarkAcknowledgedDialog: React.FC<MarkAcknowledgedDialogProps> = ({
  matterId,
  holdId,
  custodianPersonId,
  custodianName,
  onClose,
  onMarked,
}) => {
  const [reason, setReason] = useState("");
  const [witness, setWitness] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = reason.trim().length > 0 && !submitting;

  async function submit() {
    if (!ready) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/matter/${matterId}/holds/${holdId}/custodians/${custodianPersonId}/mark-ack`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reason: reason.trim(),
            witness: witness.trim() || undefined,
          }),
        },
      );
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      }
      onMarked();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      onClose={onClose}
      ariaLabel="Mark acknowledged on behalf"
      title={`Mark acknowledged · ${custodianName}`}
      icon="✍"
      sub="Records an off-line acknowledgment with the chain-sealed audit row attributing the admin actor."
      maxWidth={560}
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
        Use this when the custodian acknowledged via phone, in person, or paper.
        The acknowledgment metadata records you as the admin who marked it,
        plus the reason you provide. The custodian&apos;s status flips
        to {`"acknowledged"`} identically to a self-service ack — the
        timeline + audit log distinguish them.
      </div>

      <Field label="Reason (required)">
        <textarea
          value={reason}
          autoFocus
          onChange={(e) => setReason(e.target.value)}
          placeholder='e.g. "Acknowledged via phone call with custodian on 2026-05-04, 10:30 PT — confirmed scope, agreed to preserve."'
          rows={4}
          style={{
            ...inputStyle,
            fontFamily: F,
            fontSize: 11,
            resize: "vertical",
            minHeight: 80,
          }}
        />
      </Field>

      <Field label="Witness / signature (optional)">
        <input
          value={witness}
          onChange={(e) => setWitness(e.target.value)}
          placeholder="Name of anyone else present, or notary reference"
          style={inputStyle}
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
          {submitting ? "Marking…" : "Mark acknowledged"}
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
