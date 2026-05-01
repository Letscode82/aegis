/**
 * MatterCreateForm — type picker + dynamic field set per matter type.
 *
 * Posts to /api/matter (POST) on submit; the parent wires navigation
 * to the new matter detail page on success. AI-assisted draft (Step 4d)
 * will plug into the form here as a "Generate from intake ticket"
 * button — placeholder visible.
 */
import React, { useState } from "react";
import { Card, SH, C, F, M } from "@aegis/ui";
import type { MatterType } from "./types";

const TYPE_LABELS: Record<MatterType, string> = {
  LITIGATION: "Litigation",
  TRANSACTIONAL: "Transactional",
  MA: "M&A",
  IP: "IP",
  EMPLOYMENT: "Employment",
  REGULATORY: "Regulatory",
  INVESTIGATION: "Investigation",
  ADVISORY: "Advisory",
  OTHER: "Other",
};

const TYPE_HELP: Record<MatterType, string> = {
  LITIGATION: "Court cases, arbitration, regulatory proceedings.",
  TRANSACTIONAL: "Master agreements, vendor onboarding, procurement.",
  MA: "Mergers, acquisitions, divestitures.",
  IP: "Patent, trademark, copyright, trade secret.",
  EMPLOYMENT: "Employment disputes, harassment, terminations.",
  REGULATORY: "Compliance with regulator requests and rulemaking.",
  INVESTIGATION: "Internal investigations, whistleblower review.",
  ADVISORY: "Open-ended advisory work — opinions, counsel.",
  OTHER: "Anything that doesn't fit a defined type.",
};

const inputStyle: React.CSSProperties = {
  background: C.s1,
  border: `1px solid ${C.br}`,
  padding: "6px 10px",
  borderRadius: 5,
  color: C.t1,
  fontFamily: M,
  fontSize: 11,
  outline: "none",
  width: "100%",
};

export interface MatterCreateFormProps {
  endpoint?: string;
  onCreated?: (matterId: string) => void;
  onCancel?: () => void;
  /** Optional originating intake ticket id for matter-from-intake flow. */
  intakeTicketId?: string;
}

export const MatterCreateForm: React.FC<MatterCreateFormProps> = ({
  endpoint = "/api/matter",
  onCreated,
  onCancel,
  intakeTicketId,
}) => {
  const [type, setType] = useState<MatterType>("LITIGATION");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [estimatedDurationDays, setEstimatedDurationDays] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          title: title.trim(),
          description: description.trim() || undefined,
          jurisdiction: jurisdiction.trim() || undefined,
          estimatedValue: estimatedValue ? Number(estimatedValue) : undefined,
          estimatedDurationDays: estimatedDurationDays
            ? Number(estimatedDurationDays)
            : undefined,
          intakeTicketId,
          initialStatus: "OPEN",
        }),
      });
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${body}`);
      }
      const created = (await resp.json()) as { id: string };
      onCreated?.(created.id);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <SH icon="✏️" title="New matter" sub={TYPE_HELP[type]} />
      <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
        <div>
          <label style={{ fontSize: 10, color: C.t3, fontFamily: F }}>
            Matter type
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
            {(Object.keys(TYPE_LABELS) as MatterType[]).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setType(t)}
                style={{
                  background: t === type ? C.bl : "transparent",
                  border: `1px solid ${C.bl}`,
                  color: t === type ? C.bg : C.bl,
                  padding: "4px 10px",
                  borderRadius: 4,
                  fontSize: 10.5,
                  fontWeight: 600,
                  fontFamily: F,
                  cursor: "pointer",
                  letterSpacing: 0.3,
                }}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ fontSize: 10, color: C.t3, fontFamily: F }}>Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Snowflake MSA — renewal & re-papering"
            required
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ fontSize: 10, color: C.t3, fontFamily: F }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Background, parties, current status…"
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <div>
            <label style={{ fontSize: 10, color: C.t3, fontFamily: F }}>
              Jurisdiction
            </label>
            <input
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
              placeholder="US-FED / US-NY / EU / …"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: 10, color: C.t3, fontFamily: F }}>
              Estimated value (USD)
            </label>
            <input
              type="number"
              min={0}
              step={1000}
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: 10, color: C.t3, fontFamily: F }}>
              Estimated duration (days)
            </label>
            <input
              type="number"
              min={0}
              step={1}
              value={estimatedDurationDays}
              onChange={(e) => setEstimatedDurationDays(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 8,
          }}
        >
          <span style={{ color: C.t4, fontSize: 9.5, fontFamily: M }}>
            AI-assisted matter draft — coming in 4d.
          </span>
          <span style={{ display: "flex", gap: 8 }}>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.br}`,
                  color: C.t1,
                  padding: "6px 14px",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontFamily: F,
                  fontSize: 11,
                }}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              style={{
                background: title.trim() ? C.bl : C.br,
                border: "none",
                color: C.bg,
                fontFamily: F,
                fontWeight: 700,
                fontSize: 11,
                padding: "6px 18px",
                borderRadius: 4,
                cursor: submitting ? "wait" : title.trim() ? "pointer" : "default",
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              {submitting ? "Creating…" : "Create matter"}
            </button>
          </span>
        </div>

        {error && (
          <div
            style={{
              color: C.rd,
              fontSize: 11,
              fontFamily: M,
              padding: 8,
              border: `1px solid ${C.rd}33`,
              borderRadius: 4,
            }}
          >
            {error}
          </div>
        )}
      </form>
    </Card>
  );
};
