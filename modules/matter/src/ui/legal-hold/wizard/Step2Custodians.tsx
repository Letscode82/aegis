/**
 * Step 2 — Custodians (sub-PR 4d.0).
 *
 * Search-and-pick across the org's Person rows. Selected
 * custodians collect into a right-rail "Selected" pane with
 * remove-x chips. New people can be created inline without
 * leaving the wizard.
 */
import React, { useCallback, useEffect, useState } from "react";
import { SH, C, F, M, useToast } from "@aegis/ui";
import type { PersonOption, WizardStepProps } from "./types";

interface SearchResult {
  id: string;
  name: string;
  email: string;
  type?: string;
}

export const Step2Custodians: React.FC<WizardStepProps> = ({
  state,
  update,
  onValid,
}) => {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [creating, setCreating] = useState(false);
  const [newPerson, setNewPerson] = useState({
    name: "",
    email: "",
    department: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    onValid(state.selectedCustodians.length > 0);
  }, [state.selectedCustodians, onValid]);

  const search = useCallback(async (q: string) => {
    try {
      const r = await fetch(
        `/api/matter/people/search?q=${encodeURIComponent(q)}`,
      );
      if (!r.ok) {
        setResults([]);
        return;
      }
      const rows = (await r.json()) as SearchResult[];
      setResults(rows);
    } catch {
      setResults([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void search(query), 200);
    return () => clearTimeout(t);
  }, [query, search]);

  const isSelected = (id: string) =>
    state.selectedCustodians.some((c) => c.id === id);

  function toggle(p: SearchResult) {
    if (isSelected(p.id)) {
      update({
        selectedCustodians: state.selectedCustodians.filter((c) => c.id !== p.id),
      });
    } else {
      const next: PersonOption = {
        id: p.id,
        name: p.name,
        email: p.email,
      };
      update({
        selectedCustodians: [...state.selectedCustodians, next],
      });
    }
  }

  function remove(id: string) {
    update({
      selectedCustodians: state.selectedCustodians.filter((c) => c.id !== id),
    });
  }

  async function createPerson() {
    if (!newPerson.name.trim() || !newPerson.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/matter/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPerson.name.trim(),
          email: newPerson.email.trim(),
          department: newPerson.department.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      const created = (await r.json()) as SearchResult;
      update({
        selectedCustodians: [
          ...state.selectedCustodians,
          { id: created.id, name: created.name, email: created.email },
        ],
      });
      setNewPerson({ name: "", email: "", department: "" });
      setCreating(false);
      toast.success(`Added ${created.name}`);
    } catch (e) {
      toast.error(`Create failed: ${String((e as Error).message ?? e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24 }}>
      <div style={{ display: "grid", gap: 12 }}>
        <SH icon="👥" title="Custodians" sub="Who is affected?" />

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find by name or email…"
            style={{ ...inputStyle(), flex: 1 }}
          />
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            style={{
              border: `1px solid ${C.brL}`,
              background: "transparent",
              color: C.bl,
              padding: "8px 12px",
              fontFamily: F,
              fontWeight: 600,
              fontSize: 11,
              borderRadius: 4,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {creating ? "Cancel" : "+ Add new custodian"}
          </button>
        </div>

        {creating && (
          <div
            style={{
              padding: 12,
              background: C.s1,
              border: `1px solid ${C.brL}`,
              borderRadius: 4,
              display: "grid",
              gap: 8,
            }}
          >
            <input
              value={newPerson.name}
              onChange={(e) =>
                setNewPerson((p) => ({ ...p, name: e.target.value }))
              }
              placeholder="Name"
              style={inputStyle()}
            />
            <input
              value={newPerson.email}
              onChange={(e) =>
                setNewPerson((p) => ({ ...p, email: e.target.value }))
              }
              placeholder="Email"
              style={inputStyle()}
            />
            <input
              value={newPerson.department}
              onChange={(e) =>
                setNewPerson((p) => ({ ...p, department: e.target.value }))
              }
              placeholder="Department (optional)"
              style={inputStyle()}
            />
            <div>
              <button
                type="button"
                onClick={() => void createPerson()}
                disabled={submitting}
                style={{
                  background: C.bl,
                  border: "none",
                  color: C.bg,
                  padding: "6px 14px",
                  fontFamily: F,
                  fontWeight: 700,
                  fontSize: 11,
                  borderRadius: 4,
                  cursor: submitting ? "wait" : "pointer",
                  opacity: submitting ? 0.6 : 1,
                  textTransform: "uppercase",
                }}
              >
                {submitting ? "Saving…" : "Save & add"}
              </button>
            </div>
          </div>
        )}

        <div
          style={{
            border: `1px solid ${C.brL}`,
            borderRadius: 4,
            background: C.s1,
            maxHeight: 360,
            overflowY: "auto",
          }}
        >
          {results.length === 0 && (
            <div style={{ padding: 14, color: C.t3, fontSize: 11 }}>
              {query.length === 0
                ? "Start typing to search…"
                : "No matches."}
            </div>
          )}
          {results.map((p) => {
            const selected = isSelected(p.id);
            return (
              <label
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  borderBottom: `1px solid ${C.brL}`,
                  cursor: "pointer",
                  background: selected ? C.blG : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggle(p)}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: C.t3, fontFamily: M }}>
                    {p.email}
                  </div>
                </div>
                {p.type && (
                  <div
                    style={{
                      fontSize: 10,
                      color: C.t3,
                      fontFamily: M,
                      letterSpacing: 0.3,
                      textTransform: "uppercase",
                    }}
                  >
                    {p.type}
                  </div>
                )}
              </label>
            );
          })}
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
          gap: 10,
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
          {state.selectedCustodians.length} custodian
          {state.selectedCustodians.length === 1 ? "" : "s"} on this hold
        </div>
        {state.selectedCustodians.length === 0 && (
          <div style={{ fontSize: 11, color: C.t3 }}>
            No one selected yet.
          </div>
        )}
        {state.selectedCustodians.map((c) => (
          <div
            key={c.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 10px",
              background: C.s1,
              border: `1px solid ${C.brL}`,
              borderRadius: 4,
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 12 }}>{c.name}</div>
              <div style={{ fontSize: 10, color: C.t3, fontFamily: M }}>
                {c.email}
              </div>
            </div>
            <button
              type="button"
              onClick={() => remove(c.id)}
              aria-label={`Remove ${c.name}`}
              style={{
                background: "transparent",
                border: "none",
                color: C.t3,
                fontFamily: M,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>
        ))}
      </aside>
    </div>
  );
};

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
