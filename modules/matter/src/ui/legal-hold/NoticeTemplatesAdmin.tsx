/**
 * NoticeTemplatesAdmin — list of org notice templates with a deep
 * link into the existing NoticeTemplateEditor (sub-PR 4c.5, Item 17).
 * Sub-PR 4c.1 added this list page so the editor has a navigable
 * entry point — previously it could only be reached by knowing a
 * template id.
 *
 * Reached at /admin/legal-hold/notice-templates.
 *
 * Permission: admin:legal_hold:templates_manage.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Card, Pill, SH, C, F, M, useToast } from "@aegis/ui";

interface NoticeTemplateRow {
  id: string;
  name: string;
  jurisdictionKey: string | null;
  bodyMarkdown: string;
  bodyHash: string;
  version: number;
  isActive: boolean;
  updatedAt: string;
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

export const NoticeTemplatesAdmin: React.FC = () => {
  const toast = useToast();
  const [rows, setRows] = useState<NoticeTemplateRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newJurisdiction, setNewJurisdiction] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/legal-hold/notice-templates");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = (await r.json()) as NoticeTemplateRow[];
      setRows(body);
    } catch (e) {
      toast.error(`Failed to load templates: ${String(e)}`);
      setRows([]);
    }
  }, [toast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function createTemplate() {
    if (!newName.trim()) {
      toast.error("Template name is required");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/admin/legal-hold/notice-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          jurisdictionKey: newJurisdiction.trim() || null,
          bodyMarkdown:
            "# Legal Hold Notice — {{matter.title}}\n\nDear {{custodian.name}},\n\nThis notice informs you of a legal hold.\n\nAcknowledge: {{notice.acknowledgmentLink}}\n",
        }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      const created = (await r.json()) as NoticeTemplateRow;
      toast.success("Template created — opening editor");
      setCreating(false);
      setNewName("");
      setNewJurisdiction("");
      window.location.assign(
        `/admin/legal-hold/notice-templates/${created.id}/edit`,
      );
    } catch (e) {
      toast.error(`Create failed: ${String((e as Error).message ?? e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: 14, display: "grid", gap: 14, maxWidth: 960, fontFamily: F, color: C.t1 }}>
      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <SH
            icon="✉"
            title="Notice templates"
            sub="Hold notice content used by the composer + reminder flow"
          />
          {!creating && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              style={{
                background: C.bl,
                border: "none",
                color: C.bg,
                padding: "6px 14px",
                borderRadius: 4,
                fontFamily: F,
                fontWeight: 700,
                fontSize: 11,
                cursor: "pointer",
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              New template
            </button>
          )}
        </div>

        {creating && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              background: C.bg,
              borderRadius: 4,
              border: `1px solid ${C.brL}`,
              display: "grid",
              gap: 10,
            }}
          >
            <div>
              <label style={labelStyle}>Name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Default English notice"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Jurisdiction (optional)</label>
              <input
                value={newJurisdiction}
                onChange={(e) => setNewJurisdiction(e.target.value)}
                placeholder="e.g. EU-DE, US-CA, leave blank for default"
                style={inputStyle}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={createTemplate}
                disabled={submitting}
                style={{
                  background: C.bl,
                  border: "none",
                  color: C.bg,
                  padding: "6px 14px",
                  borderRadius: 4,
                  fontFamily: F,
                  fontWeight: 700,
                  fontSize: 11,
                  cursor: submitting ? "wait" : "pointer",
                  opacity: submitting ? 0.6 : 1,
                  textTransform: "uppercase",
                }}
              >
                {submitting ? "Creating…" : "Create + edit"}
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.brL}`,
                  color: C.t1,
                  padding: "6px 12px",
                  borderRadius: 4,
                  fontFamily: F,
                  fontWeight: 600,
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {rows === null && (
          <div style={{ marginTop: 14, color: C.t3, fontSize: 11 }}>Loading…</div>
        )}
        {rows && rows.length === 0 && (
          <div style={{ marginTop: 14, color: C.t3, fontSize: 11 }}>
            No notice templates yet. Click <strong>New template</strong> to seed one.
          </div>
        )}
        {rows && rows.length > 0 && (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginTop: 14,
              fontSize: 11,
            }}
          >
            <thead>
              <tr style={{ textAlign: "left", color: C.t3 }}>
                <Th>Name</Th>
                <Th>Jurisdiction</Th>
                <Th>Version</Th>
                <Th>Status</Th>
                <Th>Updated</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  style={{ borderTop: `1px solid ${C.brL}` }}
                >
                  <Td>
                    <span style={{ color: C.t1, fontWeight: 600 }}>{row.name}</span>
                  </Td>
                  <Td>
                    <span style={{ fontFamily: M, color: C.t1 }}>
                      {row.jurisdictionKey ?? "(default)"}
                    </span>
                  </Td>
                  <Td>
                    <span style={{ fontFamily: M, color: C.t1 }}>v{row.version}</span>
                  </Td>
                  <Td>
                    <Pill
                      t={row.isActive ? "ACTIVE" : "ARCHIVED"}
                      c={row.isActive ? C.gn : C.t3}
                    />
                  </Td>
                  <Td>
                    <span style={{ fontFamily: M, color: C.t3 }}>
                      {new Date(row.updatedAt)
                        .toISOString()
                        .replace("T", " ")
                        .slice(0, 16)}
                    </span>
                  </Td>
                  <Td>
                    <a
                      href={`/admin/legal-hold/notice-templates/${row.id}/edit`}
                      style={{
                        color: C.bl,
                        fontFamily: F,
                        fontWeight: 600,
                        fontSize: 11,
                        textDecoration: "none",
                      }}
                    >
                      Edit →
                    </a>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  fontFamily: M,
  fontSize: 9.5,
  color: C.t3,
  letterSpacing: 0.5,
  textTransform: "uppercase",
};

const Th: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <th
    style={{
      padding: "6px 8px",
      fontFamily: M,
      fontSize: 9.5,
      fontWeight: 600,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      color: C.t3,
    }}
  >
    {children}
  </th>
);

const Td: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <td style={{ padding: "10px 8px", verticalAlign: "middle" }}>{children}</td>
);
