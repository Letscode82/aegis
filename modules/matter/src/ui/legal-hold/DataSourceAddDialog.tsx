/**
 * DataSourceAddDialog — three-mode data-source mapping dialog,
 * shaped to mirror the existing CustodianAddDialog.
 *
 * Modes:
 *   1. Auto-discover (M365)  — GET /custodians/[personId]/discover,
 *                              renders the typed list, user checks
 *                              what to map.
 *   2. Pick from typed list  — DataSourceType dropdown + identifier
 *                              + label fields.
 *   3. Manual                — free-form display label, type=OTHER,
 *                              optional metadata JSON.
 *
 * Every add path POSTs to /custodians/[personId]/data-sources with
 * the same body shape — the service stamps preservationAction
 * default (LEGAL_HOLD_IN_PLACE) and audits via recordHoldEvent.
 */
import React, { useEffect, useState } from "react";
import { C, F, M } from "@aegis/ui";
import { ModalShell } from "./ModalShell";

type Mode = "discover" | "typed" | "manual";

const DATA_SOURCE_TYPES = [
  "EMAIL_MAILBOX",
  "ARCHIVED_MAILBOX",
  "DEPARTED_USER_MAILBOX",
  "ONEDRIVE",
  "SHAREPOINT_SITE",
  "TEAMS_CHANNEL",
  "TEAMS_DM",
  "TEAMS_PRIVATE_CHANNEL",
  "SLACK_CHANNEL",
  "SLACK_DM",
  "GOOGLE_DRIVE",
  "GOOGLE_CHAT",
  "EPHEMERAL_CHAT_AUTO_DELETE",
  "LOCAL_DEVICE",
  "PHYSICAL_FILES",
  "THIRD_PARTY_SAAS",
  "OTHER",
] as const;
type DataSourceType = (typeof DATA_SOURCE_TYPES)[number];

interface DiscoveredSource {
  type: DataSourceType;
  externalIdentifier: string;
  displayLabel: string;
  retentionPolicy: string | null;
  retentionPolicyConflict: boolean;
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

export interface DataSourceAddDialogProps {
  matterId: string;
  holdId: string;
  custodianPersonId: string;
  custodianName: string;
  /** IDs of sources already mapped — used to disable duplicates. */
  existingExternalIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}

export const DataSourceAddDialog: React.FC<DataSourceAddDialogProps> = ({
  matterId,
  holdId,
  custodianPersonId,
  custodianName,
  onClose,
  onAdded,
}) => {
  const [mode, setMode] = useState<Mode>("discover");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = `/api/matter/${matterId}/holds/${holdId}/custodians/${custodianPersonId}/data-sources`;

  async function add(payload: {
    type: DataSourceType;
    externalIdentifier: string;
    displayLabel: string;
    retentionPolicyConflict?: boolean;
    metadata?: Record<string, unknown>;
  }) {
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(baseUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok && r.status !== 201) {
        throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      }
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      onClose={onClose}
      ariaLabel="Add data source"
      title={`Add data source · ${custodianName}`}
      icon="📦"
      sub="Map preservation targets discoverable from M365, the typed list, or manually."
      maxWidth={680}
    >
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {(["discover", "typed", "manual"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            style={{
              background: mode === m ? C.cd : "transparent",
              border: `1px solid ${mode === m ? C.brL : C.br}`,
              color: mode === m ? C.t1 : C.t3,
              padding: "5px 12px",
              borderRadius: 4,
              fontFamily: F,
              fontSize: 10.5,
              fontWeight: mode === m ? 700 : 400,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            {m === "discover"
              ? "M365 auto-discover"
              : m === "typed"
                ? "Typed entry"
                : "Manual"}
          </button>
        ))}
      </div>

      {mode === "discover" && (
        <DiscoverPane
          matterId={matterId}
          holdId={holdId}
          custodianPersonId={custodianPersonId}
          submitting={submitting}
          onAdd={async (rows) => {
            for (const r of rows) {
              await add({
                type: r.type,
                externalIdentifier: r.externalIdentifier,
                displayLabel: r.displayLabel,
                retentionPolicyConflict: r.retentionPolicyConflict,
              });
            }
            onAdded();
          }}
        />
      )}
      {mode === "typed" && (
        <TypedPane
          submitting={submitting}
          onSubmit={async (payload) => {
            await add(payload);
            onAdded();
          }}
        />
      )}
      {mode === "manual" && (
        <ManualPane
          submitting={submitting}
          onSubmit={async (payload) => {
            await add(payload);
            onAdded();
          }}
        />
      )}

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
    </ModalShell>
  );
};

// ── Mode 1: M365 auto-discover ──────────────────────────────────

const DiscoverPane: React.FC<{
  matterId: string;
  holdId: string;
  custodianPersonId: string;
  submitting: boolean;
  onAdd: (rows: DiscoveredSource[]) => Promise<void>;
}> = ({ matterId, holdId, custodianPersonId, submitting, onAdd }) => {
  const [sources, setSources] = useState<DiscoveredSource[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(
      `/api/matter/${matterId}/holds/${holdId}/custodians/${custodianPersonId}/discover`,
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((rows: DiscoveredSource[]) => {
        if (!alive) return;
        setSources(rows);
        setPicked(new Set(rows.map((r) => r.externalIdentifier)));
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [matterId, holdId, custodianPersonId]);

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (error) {
    return (
      <div style={{ color: C.rd, fontSize: 11, fontFamily: M }}>{error}</div>
    );
  }
  if (!sources) {
    return (
      <div style={{ color: C.t3, fontSize: 11, fontFamily: M }}>
        Querying M365 directory…
      </div>
    );
  }
  if (sources.length === 0) {
    return (
      <div style={{ color: C.t3, fontSize: 11, fontFamily: M }}>
        No discoverable data sources for this custodian. Use the typed entry
        tab if you know the identifier.
      </div>
    );
  }

  const selected = sources.filter((s) =>
    picked.has(s.externalIdentifier),
  );

  return (
    <div>
      <div
        style={{
          maxHeight: 320,
          overflowY: "auto",
          border: `1px solid ${C.br}`,
          borderRadius: 4,
        }}
      >
        {sources.map((s) => {
          const checked = picked.has(s.externalIdentifier);
          return (
            <label
              key={s.externalIdentifier}
              style={{
                display: "grid",
                gridTemplateColumns: "20px 1fr 140px 80px",
                gap: 8,
                padding: "6px 10px",
                fontSize: 11,
                fontFamily: F,
                cursor: "pointer",
                borderBottom: `1px solid ${C.br}22`,
                background: checked ? `${C.bl}10` : "transparent",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => togglePick(s.externalIdentifier)}
              />
              <span style={{ color: C.t1 }}>
                {s.displayLabel}
                {s.retentionPolicyConflict && (
                  <span
                    style={{
                      marginLeft: 6,
                      color: C.rd,
                      fontSize: 9.5,
                      fontFamily: M,
                    }}
                  >
                    ⚠ conflict
                  </span>
                )}
              </span>
              <span style={{ fontFamily: M, fontSize: 9.5, color: C.t3 }}>
                {s.type}
              </span>
              <span
                style={{
                  fontFamily: M,
                  fontSize: 9,
                  color: C.t4,
                  textTransform: "uppercase",
                  textAlign: "right",
                }}
              >
                {s.retentionPolicy ?? "—"}
              </span>
            </label>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          marginTop: 12,
        }}
      >
        <button
          type="button"
          disabled={submitting || selected.length === 0}
          onClick={() => onAdd(selected)}
          style={primaryBtn(selected.length > 0 && !submitting)}
        >
          {submitting
            ? "Adding…"
            : `Add ${selected.length} source${selected.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
};

// ── Mode 2: typed-list entry ────────────────────────────────────

const TypedPane: React.FC<{
  submitting: boolean;
  onSubmit: (payload: {
    type: DataSourceType;
    externalIdentifier: string;
    displayLabel: string;
  }) => Promise<void>;
}> = ({ submitting, onSubmit }) => {
  const [type, setType] = useState<DataSourceType>("EMAIL_MAILBOX");
  const [externalIdentifier, setExternalIdentifier] = useState("");
  const [displayLabel, setDisplayLabel] = useState("");

  const ready = displayLabel.trim().length > 0 && !submitting;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <Field label="Type">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as DataSourceType)}
          style={inputStyle}
        >
          {DATA_SOURCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>
      <Field label="External identifier">
        <input
          value={externalIdentifier}
          onChange={(e) => setExternalIdentifier(e.target.value)}
          placeholder="mailbox address, drive URL, channel id…"
          style={inputStyle}
        />
      </Field>
      <Field label="Display label">
        <input
          value={displayLabel}
          onChange={(e) => setDisplayLabel(e.target.value)}
          placeholder="e.g. marcus.reid@acme.com — primary mailbox"
          style={inputStyle}
        />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          disabled={!ready}
          onClick={() =>
            onSubmit({ type, externalIdentifier, displayLabel })
          }
          style={primaryBtn(ready)}
        >
          {submitting ? "Adding…" : "Add data source"}
        </button>
      </div>
    </div>
  );
};

// ── Mode 3: manual entry ────────────────────────────────────────

const ManualPane: React.FC<{
  submitting: boolean;
  onSubmit: (payload: {
    type: DataSourceType;
    externalIdentifier: string;
    displayLabel: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
}> = ({ submitting, onSubmit }) => {
  const [displayLabel, setDisplayLabel] = useState("");
  const [metadataText, setMetadataText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  function submit() {
    let metadata: Record<string, unknown> | undefined;
    if (metadataText.trim()) {
      try {
        metadata = JSON.parse(metadataText);
      } catch (e) {
        setParseError(`metadata JSON invalid: ${String(e)}`);
        return;
      }
    }
    setParseError(null);
    onSubmit({
      type: "OTHER",
      externalIdentifier: `manual:${Date.now()}`,
      displayLabel,
      metadata,
    });
  }

  const ready = displayLabel.trim().length > 0 && !submitting;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div
        style={{
          fontSize: 10.5,
          color: C.t3,
          fontFamily: F,
          lineHeight: 1.5,
        }}
      >
        Manual entry creates a free-form data-source row of type{" "}
        <span style={{ fontFamily: M, color: C.t2 }}>OTHER</span>. Use this
        for physical files, third-party SaaS that AEGIS can&apos;t auto-discover,
        or interim records pending integration.
      </div>
      <Field label="Display label">
        <input
          value={displayLabel}
          onChange={(e) => setDisplayLabel(e.target.value)}
          placeholder="e.g. Finance shared drive backup, 2024-Q3"
          style={inputStyle}
        />
      </Field>
      <Field label="Metadata (optional JSON)">
        <textarea
          value={metadataText}
          onChange={(e) => setMetadataText(e.target.value)}
          placeholder='{ "location": "off-site vault", "owner": "..." }'
          rows={3}
          style={{ ...inputStyle, fontFamily: M, fontSize: 10.5 }}
        />
      </Field>
      {parseError && (
        <div style={{ color: C.rd, fontSize: 10.5, fontFamily: M }}>
          {parseError}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          disabled={!ready}
          onClick={submit}
          style={primaryBtn(ready)}
        >
          {submitting ? "Adding…" : "Add data source"}
        </button>
      </div>
    </div>
  );
};

// ── shared bits ─────────────────────────────────────────────────

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <label style={{ display: "block" }}>
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

function primaryBtn(ready: boolean): React.CSSProperties {
  return {
    background: ready ? C.bl : C.br,
    color: ready ? C.bg : C.t3,
    border: "none",
    padding: "6px 18px",
    borderRadius: 4,
    fontFamily: F,
    fontSize: 11,
    fontWeight: 700,
    cursor: ready ? "pointer" : "default",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  };
}
