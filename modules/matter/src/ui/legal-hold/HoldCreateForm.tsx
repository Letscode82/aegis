/**
 * HoldCreateForm — minimal create flow. POSTs /api/matter/[id]/holds.
 * The hold lands in DRAFT state; a separate Issue action transitions
 * to ISSUED + assigns the hold number.
 */
import React, { useState } from "react";
import { Card, SH, C, F, M } from "@aegis/ui";

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

export interface HoldCreateFormProps {
  matterId: string;
  endpoint?: string;
  onCreated?: (holdId: string) => void;
  onCancel?: () => void;
}

const COMMON_JURISDICTIONS = ["US-CA", "US-NY", "US-FED", "EU", "UK", "CA-ON"];

export const HoldCreateForm: React.FC<HoldCreateFormProps> = ({
  matterId,
  endpoint = "/api/matter",
  onCreated,
  onCancel,
}) => {
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState("");
  const [trigger, setTrigger] = useState("");
  const [jurisdictions, setJurisdictions] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleJurisdiction(code: string) {
    setJurisdictions((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`${endpoint}/${matterId}/holds`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          scopeDescription: scope.trim(),
          jurisdictions: Array.from(jurisdictions),
          triggerEventDescription: trigger.trim() || undefined,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      const j = (await r.json()) as { id: string };
      onCreated?.(j.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <SH icon="✏️" title="New legal hold" sub="Lands in DRAFT — issue afterwards to assign a hold number and notify custodians" />
      <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
        <div>
          <label style={{ fontSize: 10, color: C.t3, fontFamily: F }}>Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="e.g. Snowflake MSA — preservation"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={{ fontSize: 10, color: C.t3, fontFamily: F }}>Scope</label>
          <textarea
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            required
            placeholder="What data + which custodians + what time period…"
            rows={4}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>
        <div>
          <label style={{ fontSize: 10, color: C.t3, fontFamily: F }}>
            Trigger event (litigation reasonably anticipated)
          </label>
          <input
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            placeholder="What just happened that triggered preservation duty?"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={{ fontSize: 10, color: C.t3, fontFamily: F }}>Jurisdictions</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
            {COMMON_JURISDICTIONS.map((j) => {
              const on = jurisdictions.has(j);
              return (
                <button
                  type="button"
                  key={j}
                  onClick={() => toggleJurisdiction(j)}
                  style={{
                    background: on ? C.bl : "transparent",
                    border: `1px solid ${C.bl}`,
                    color: on ? C.bg : C.bl,
                    padding: "3px 10px",
                    borderRadius: 4,
                    fontSize: 10,
                    fontFamily: M,
                    cursor: "pointer",
                  }}
                >
                  {j}
                </button>
              );
            })}
          </div>
        </div>
        {error && (
          <div style={{ color: C.rd, fontSize: 11, fontFamily: M }}>{error}</div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
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
            disabled={submitting || !title.trim() || !scope.trim()}
            style={{
              background: title.trim() && scope.trim() ? C.bl : C.br,
              border: "none",
              color: C.bg,
              padding: "6px 18px",
              borderRadius: 4,
              cursor: submitting ? "wait" : "pointer",
              fontFamily: F,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            {submitting ? "Drafting…" : "Draft hold"}
          </button>
        </div>
      </form>
    </Card>
  );
};
