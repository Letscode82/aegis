/**
 * HoldScopeTemplatesAdmin — list / edit / create / delete scope
 * templates (sub-PR 4c.4, Item 12).
 *
 * One page covers all four operations to match the lite-CRUD scope
 * the brief asks for (no separate `new` and `[id]` pages). Reached
 * at /admin/legal-hold/templates.
 */
import React, { useEffect, useState } from "react";
import { Card, SH, C, F, M, useToast } from "@aegis/ui";

const COMMON_JURISDICTIONS = ["US-CA", "US-NY", "US-FED", "EU", "EU-DE", "UK", "CA-ON"];

interface ScopeTemplate {
  id: string;
  name: string;
  description: string | null;
  scopeMarkdown: string;
  defaultJurisdictions: string[];
  createdAt: string;
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

export const HoldScopeTemplatesAdmin: React.FC = () => {
  const toast = useToast();
  const [templates, setTemplates] = useState<ScopeTemplate[] | null>(null);
  const [editing, setEditing] = useState<ScopeTemplate | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  function reload() {
    fetch("/api/admin/legal-hold/templates")
      .then((r) => (r.ok ? r.json() : []))
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }

  useEffect(() => {
    reload();
  }, []);

  return (
    <div style={{ padding: 14, display: "grid", gap: 14, maxWidth: 960 }}>
      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <SH
            icon="📋"
            title="Hold scope templates"
            sub="Pre-written scope language for common litigation patterns. Selecting a template in the create-hold form auto-fills scope + jurisdictions."
          />
          <button
            type="button"
            onClick={() => setCreatingNew(true)}
            style={primaryBtn(true)}
          >
            + New template
          </button>
        </div>

        {!templates && (
          <div style={{ color: C.t3, fontFamily: M, fontSize: 11, marginTop: 12 }}>
            Loading templates…
          </div>
        )}
        {templates && templates.length === 0 && !creatingNew && (
          <div
            style={{
              marginTop: 14,
              padding: 14,
              border: `1px dashed ${C.br}`,
              borderRadius: 6,
              textAlign: "center",
              fontFamily: F,
              fontSize: 11,
              color: C.t3,
            }}
          >
            No scope templates yet. Click + New template to add one.
          </div>
        )}
        {templates && templates.length > 0 && (
          <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
            {templates.map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => setEditing(t)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 200px 90px",
                  gap: 10,
                  padding: "10px 12px",
                  background: C.s1,
                  border: `1px solid ${C.br}`,
                  borderRadius: 4,
                  fontFamily: F,
                  fontSize: 11.5,
                  color: C.t1,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span>
                  <span style={{ fontWeight: 600 }}>{t.name}</span>
                  {t.description && (
                    <div
                      style={{ fontSize: 10, color: C.t3, marginTop: 2 }}
                    >
                      {t.description}
                    </div>
                  )}
                </span>
                <span
                  style={{
                    fontFamily: M,
                    fontSize: 10,
                    color: C.t3,
                    alignSelf: "center",
                  }}
                >
                  {t.defaultJurisdictions.length > 0
                    ? t.defaultJurisdictions.join(", ")
                    : "(no jurisdictions)"}
                </span>
                <span
                  style={{
                    fontFamily: M,
                    fontSize: 10,
                    color: C.t4,
                    textAlign: "right",
                    alignSelf: "center",
                  }}
                >
                  {new Date(t.createdAt).toISOString().slice(0, 10)}
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {(editing || creatingNew) && (
        <TemplateEditor
          existing={editing}
          onClose={() => {
            setEditing(null);
            setCreatingNew(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreatingNew(false);
            reload();
            toast.success("Template saved.");
          }}
          onDeleted={() => {
            setEditing(null);
            setCreatingNew(false);
            reload();
            toast.success("Template deleted.");
          }}
        />
      )}
    </div>
  );
};

const TemplateEditor: React.FC<{
  existing: ScopeTemplate | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}> = ({ existing, onClose, onSaved, onDeleted }) => {
  const toast = useToast();
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [scope, setScope] = useState(existing?.scopeMarkdown ?? "");
  const [jurs, setJurs] = useState<Set<string>>(
    new Set(existing?.defaultJurisdictions ?? []),
  );
  const [submitting, setSubmitting] = useState(false);

  function toggleJur(code: string) {
    setJurs((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function save() {
    setSubmitting(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim(),
        scopeMarkdown: scope,
        defaultJurisdictions: Array.from(jurs),
      };
      const url = existing
        ? `/api/admin/legal-hold/templates/${existing.id}`
        : "/api/admin/legal-hold/templates";
      const method = existing ? "PUT" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok && r.status !== 201) {
        throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      }
      onSaved();
    } catch (e) {
      toast.error(`Save failed: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!existing) return;
    if (!window.confirm(`Delete template "${existing.name}"?`)) return;
    setSubmitting(true);
    try {
      const r = await fetch(
        `/api/admin/legal-hold/templates/${existing.id}`,
        { method: "DELETE" },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      onDeleted();
    } catch (e) {
      toast.error(`Delete failed: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  const ready = name.trim().length > 0 && scope.trim().length > 0 && !submitting;

  return (
    <Card>
      <SH
        icon="✏️"
        title={existing ? `Edit template — ${existing.name}` : "New template"}
        sub="Templates are org-wide; every legal-ops user sees them in the create-hold dropdown."
      />
      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        <Field label="Name (required)">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='e.g. "Employment dispute"'
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
        <Field label="Scope language (markdown, required)">
          <textarea
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            rows={8}
            placeholder="What data + which custodians + what time period…"
            style={{
              ...inputStyle,
              fontFamily: F,
              resize: "vertical",
              minHeight: 160,
            }}
          />
        </Field>
        <Field label="Default jurisdictions">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {COMMON_JURISDICTIONS.map((j) => {
              const on = jurs.has(j);
              return (
                <button
                  type="button"
                  key={j}
                  onClick={() => toggleJur(j)}
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
        </Field>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 14,
          gap: 8,
        }}
      >
        <span>
          {existing && (
            <button
              type="button"
              onClick={remove}
              disabled={submitting}
              style={dangerBtn(submitting)}
            >
              Delete
            </button>
          )}
        </span>
        <span style={{ display: "flex", gap: 8 }}>
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
            onClick={save}
            disabled={!ready}
            style={primaryBtn(ready)}
          >
            {submitting ? "Saving…" : existing ? "Save changes" : "Create template"}
          </button>
        </span>
      </div>
    </Card>
  );
};

function primaryBtn(ready: boolean): React.CSSProperties {
  return {
    background: ready ? C.bl : C.br,
    color: ready ? C.bg : C.t3,
    border: "none",
    padding: "7px 18px",
    borderRadius: 4,
    fontFamily: F,
    fontSize: 11,
    fontWeight: 700,
    cursor: ready ? "pointer" : "default",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  };
}

function dangerBtn(submitting: boolean): React.CSSProperties {
  return {
    background: "transparent",
    border: `1px solid ${C.rd}55`,
    color: C.rd,
    padding: "7px 14px",
    borderRadius: 4,
    cursor: submitting ? "wait" : "pointer",
    fontFamily: F,
    fontSize: 11,
  };
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <label style={{ display: "block" }}>
    <span
      style={{
        display: "block",
        fontFamily: F,
        fontSize: 9.5,
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
