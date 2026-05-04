/**
 * CustodianAddDialog — three-mode add flow.
 *
 * Modes:
 *   1. Search M365 directory   → /api/matter/people/search (Person
 *                                table is the seed source; 4c's
 *                                Graph discovery feeds the same
 *                                Person table via separate flow)
 *   2. Pick from matter team   → /api/matter/[id]/parties
 *   3. Manual entry            → name + email; creates a Person row
 *                                via the existing `addHoldCustodian`
 *                                path (the legal-hold service
 *                                accepts a personId, so manual mode
 *                                creates the Person first via the
 *                                people/search endpoint's POST
 *                                — when that exists. For 4c.2 we
 *                                require an existing Person record;
 *                                manual mode is a thin label-only
 *                                form for now and points users to
 *                                the org admin if the person isn't
 *                                in the directory.)
 *
 * Keyboard: Tab navigation, Enter on a row picks, Escape closes.
 */
import React, { useEffect, useState } from "react";
import { SH, C, F, M } from "@aegis/ui";

interface PersonHit {
  id: string;
  name: string;
  email: string | null;
  type: string;
}

interface MatterPartyHit {
  personId: string;
  personName: string;
  role: string;
}

type Mode = "search" | "team" | "manual";

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

export interface CustodianAddDialogProps {
  matterId: string;
  holdId: string;
  /** PersonIds already on the hold so we can disable duplicates. */
  existingPersonIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}

export const CustodianAddDialog: React.FC<CustodianAddDialogProps> = ({
  matterId,
  holdId,
  existingPersonIds,
  onClose,
  onAdded,
}) => {
  const [mode, setMode] = useState<Mode>("search");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function add(personId: string) {
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/matter/${matterId}/holds/${holdId}/custodians`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ personId }),
        },
      );
      if (!r.ok && r.status !== 201) {
        throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      }
      onAdded();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add custodians"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.65)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.cd,
          border: `1px solid ${C.brL}`,
          padding: 16,
          minWidth: 520,
          maxWidth: 640,
          maxHeight: "85vh",
          overflowY: "auto",
          fontFamily: F,
          color: C.t1,
        }}
      >
        <SH icon="✚" title="Add custodians" sub="Pick a source — directory, matter team, or manual." />

        <div style={{ display: "flex", gap: 4, marginTop: 12, marginBottom: 12 }}>
          {(["search", "team", "manual"] as Mode[]).map((m) => (
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
              {m === "search" ? "M365 directory" : m === "team" ? "Matter team" : "Manual"}
            </button>
          ))}
        </div>

        {mode === "search" && (
          <PersonSearch
            existingPersonIds={existingPersonIds}
            onPick={add}
            disabled={submitting}
          />
        )}
        {mode === "team" && (
          <MatterTeamPicker
            matterId={matterId}
            existingPersonIds={existingPersonIds}
            onPick={add}
            disabled={submitting}
          />
        )}
        {mode === "manual" && (
          <ManualEntryNote
            onSwitch={() => setMode("search")}
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

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button
            type="button"
            onClick={onClose}
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
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Mode 1: M365 directory search via existing /people/search ────

const PersonSearch: React.FC<{
  existingPersonIds: Set<string>;
  onPick: (personId: string) => void;
  disabled: boolean;
}> = ({ existingPersonIds, onPick, disabled }) => {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PersonHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    fetch(`/api/matter/people/search?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d: PersonHit[]) => alive && setHits(d))
      .catch(() => alive && setHits([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [query]);

  return (
    <div>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or email…"
        style={inputStyle}
      />
      <div
        style={{
          marginTop: 8,
          maxHeight: 320,
          overflowY: "auto",
          border: `1px solid ${C.br}`,
          borderRadius: 4,
        }}
      >
        {loading && hits.length === 0 && (
          <div style={{ padding: 8, color: C.t3, fontSize: 11, fontFamily: M }}>
            Searching…
          </div>
        )}
        {!loading && hits.length === 0 && (
          <div style={{ padding: 8, color: C.t3, fontSize: 11, fontFamily: M }}>
            No people match.
          </div>
        )}
        {hits.map((h) => {
          const already = existingPersonIds.has(h.id);
          return (
            <div
              key={h.id}
              role="button"
              tabIndex={already ? -1 : 0}
              onClick={() => !already && onPick(h.id)}
              onKeyDown={(e) => {
                if (!already && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onPick(h.id);
                }
              }}
              aria-disabled={already}
              style={{
                padding: "6px 10px",
                cursor: already || disabled ? "default" : "pointer",
                opacity: already ? 0.4 : 1,
                display: "grid",
                gridTemplateColumns: "1fr 130px 80px",
                gap: 8,
                borderBottom: `1px solid ${C.br}22`,
                fontSize: 11,
                fontFamily: F,
              }}
            >
              <span style={{ color: C.t1 }}>{h.name}</span>
              <span style={{ color: C.t3, fontFamily: M, fontSize: 10 }}>
                {h.email ?? ""}
              </span>
              <span
                style={{
                  textAlign: "right",
                  fontFamily: M,
                  color: already ? C.t4 : C.t3,
                  fontSize: 9,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                }}
              >
                {already ? "on hold" : h.type}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Mode 2: matter team picker ──────────────────────────────────

const MatterTeamPicker: React.FC<{
  matterId: string;
  existingPersonIds: Set<string>;
  onPick: (personId: string) => void;
  disabled: boolean;
}> = ({ matterId, existingPersonIds, onPick }) => {
  const [parties, setParties] = useState<MatterPartyHit[] | null>(null);

  useEffect(() => {
    fetch(`/api/matter/${matterId}/parties`)
      .then((r) => r.json())
      .then(setParties)
      .catch(() => setParties([]));
  }, [matterId]);

  if (!parties) {
    return (
      <div style={{ color: C.t3, fontSize: 11, fontFamily: M }}>Loading…</div>
    );
  }
  if (parties.length === 0) {
    return (
      <div style={{ color: C.t3, fontSize: 11, fontFamily: M }}>
        No team members on this matter yet.
      </div>
    );
  }
  return (
    <div
      style={{
        border: `1px solid ${C.br}`,
        borderRadius: 4,
        maxHeight: 320,
        overflowY: "auto",
      }}
    >
      {parties.map((p) => {
        const already = existingPersonIds.has(p.personId);
        return (
          <div
            key={p.personId + p.role}
            role="button"
            tabIndex={already ? -1 : 0}
            onClick={() => !already && onPick(p.personId)}
            onKeyDown={(e) => {
              if (!already && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onPick(p.personId);
              }
            }}
            style={{
              padding: "6px 10px",
              cursor: already ? "default" : "pointer",
              opacity: already ? 0.4 : 1,
              display: "grid",
              gridTemplateColumns: "1fr 160px 80px",
              gap: 8,
              borderBottom: `1px solid ${C.br}22`,
              fontSize: 11,
              fontFamily: F,
            }}
          >
            <span style={{ color: C.t1 }}>{p.personName}</span>
            <span style={{ color: C.t3, fontFamily: M, fontSize: 10 }}>{p.role}</span>
            <span
              style={{
                textAlign: "right",
                fontFamily: M,
                color: already ? C.t4 : C.t3,
                fontSize: 9,
                textTransform: "uppercase",
              }}
            >
              {already ? "on hold" : "add"}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ── Mode 3: manual entry note ───────────────────────────────────

const ManualEntryNote: React.FC<{ onSwitch: () => void }> = ({ onSwitch }) => (
  <div
    style={{
      padding: 12,
      border: `1px solid ${C.br}`,
      borderRadius: 4,
      fontSize: 11,
      fontFamily: F,
      color: C.t2,
      lineHeight: 1.5,
    }}
  >
    Manual entry creates a Person row in the org directory before linking
    to the hold. The provisioning surface lives in the admin module —
    add the person there first, then return to{" "}
    <span
      onClick={onSwitch}
      style={{ color: C.bl, cursor: "pointer", textDecoration: "underline" }}
      role="button"
      tabIndex={0}
    >
      M365 directory search
    </span>{" "}
    to add them as a custodian.
  </div>
);
