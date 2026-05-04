/**
 * NoticesRailCard — count + last issuance + "+ Issue notice"
 * button that opens the existing notice issuance flow as a modal.
 */
import React, { useEffect, useState } from "react";
import { Card, SH, C, F, M } from "@aegis/ui";
import type { HoldNoticeIssuanceDTO } from "./types";

export interface NoticesRailCardProps {
  matterId: string;
  holdId: string;
  /** Set when actor has matter:legal_hold:issue. */
  canMutate: boolean;
}

export const NoticesRailCard: React.FC<NoticesRailCardProps> = ({
  matterId,
  holdId,
  canMutate,
}) => {
  const [rows, setRows] = useState<HoldNoticeIssuanceDTO[] | null>(null);
  const [open, setOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    fetch(`/api/matter/${matterId}/holds/${holdId}/notices`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then(setRows)
      .catch(() => setRows([]));
  }, [matterId, holdId, reloadKey]);

  const last = rows && rows.length > 0 ? rows[0] : null;

  return (
    <Card>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <SH icon="📜" title="Notices" />
        <span style={{ fontFamily: M, fontSize: 9, color: C.t4, letterSpacing: 0.4 }}>
          {rows?.length ?? 0} ISSUED
        </span>
      </div>

      {!rows && (
        <div style={{ color: C.t3, fontSize: 11, fontFamily: M, marginTop: 8 }}>
          Loading…
        </div>
      )}
      {rows && rows.length === 0 && (
        <div style={{ color: C.t3, fontSize: 11, fontFamily: M, marginTop: 8 }}>
          No notices issued yet.
        </div>
      )}
      {last && (
        <div
          style={{
            marginTop: 10,
            padding: 8,
            background: C.s1,
            border: `1px solid ${C.br}33`,
            borderRadius: 4,
            fontFamily: F,
            fontSize: 10.5,
            color: C.t2,
          }}
        >
          <div style={{ color: C.t1, marginBottom: 2 }}>{last.templateName}</div>
          <div style={{ fontFamily: M, fontSize: 9.5, color: C.t3 }}>
            v{last.templateVersion} · {last.recipientCount} recipient
            {last.recipientCount === 1 ? "" : "s"}
          </div>
          <div style={{ fontFamily: M, fontSize: 9, color: C.t4, marginTop: 4 }}>
            Issued {new Date(last.issuedAt).toISOString().replace("T", " ").slice(0, 16)}
          </div>
          <div style={{ fontFamily: M, fontSize: 9, color: C.t4, marginTop: 2 }}>
            Hash {last.bodyHashAtIssuance.slice(0, 16)}…
          </div>
        </div>
      )}

      {canMutate && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            background: C.bl,
            color: C.bg,
            border: "none",
            padding: "6px 12px",
            borderRadius: 4,
            fontFamily: F,
            fontSize: 10.5,
            fontWeight: 700,
            cursor: "pointer",
            letterSpacing: 0.4,
            textTransform: "uppercase",
            marginTop: 10,
            width: "100%",
          }}
        >
          + Issue notice
        </button>
      )}

      {open && (
        <NoticeIssueDialog
          matterId={matterId}
          holdId={holdId}
          onClose={() => setOpen(false)}
          onIssued={() => {
            setOpen(false);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </Card>
  );
};

interface TemplateOption {
  id: string;
  name: string;
  version: number;
  jurisdictionKey: string | null;
}

const NoticeIssueDialog: React.FC<{
  matterId: string;
  holdId: string;
  onClose: () => void;
  onIssued: () => void;
}> = ({ matterId, holdId, onClose, onIssued }) => {
  const [templates, setTemplates] = useState<TemplateOption[] | null>(null);
  const [templateId, setTemplateId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The matter API doesn't currently expose a list-templates HTTP
    // route. We piggy-back on the hold's existing notices list to
    // discover templates already in use; for a fresh hold we let
    // the caller paste the templateId directly. 4c.2 surfaces the
    // affordance; a follow-up adds the dedicated templates endpoint.
    fetch(`/api/matter/${matterId}/holds/${holdId}/notices`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((rows: HoldNoticeIssuanceDTO[]) => {
        const seen = new Map<string, TemplateOption>();
        for (const r of rows) {
          if (!seen.has(r.templateId)) {
            seen.set(r.templateId, {
              id: r.templateId,
              name: r.templateName,
              version: r.templateVersion,
              jurisdictionKey: null,
            });
          }
        }
        const list = Array.from(seen.values());
        setTemplates(list);
        if (list[0]) setTemplateId(list[0].id);
      })
      .catch((e) => setError(String(e)));
  }, [matterId, holdId]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/matter/${matterId}/holds/${holdId}/notices`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      if (!r.ok && r.status !== 201) {
        throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      }
      onIssued();
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
      aria-label="Issue notice"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.65)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.cd,
          border: `1px solid ${C.brL}`,
          padding: 16,
          minWidth: 460,
          fontFamily: F,
          color: C.t1,
        }}
      >
        <SH icon="📜" title="Issue notice" sub="Snapshots the current template version + body hash" />
        <div style={{ marginTop: 12 }}>
          <label
            style={{
              fontSize: 10,
              color: C.t3,
              fontFamily: F,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            Template
          </label>
          {templates === null ? (
            <div style={{ color: C.t3, fontSize: 11, fontFamily: M, marginTop: 4 }}>
              Loading…
            </div>
          ) : templates.length > 0 ? (
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              style={{
                background: C.s1,
                border: `1px solid ${C.br}`,
                padding: "6px 9px",
                borderRadius: 4,
                color: C.t1,
                fontFamily: M,
                fontSize: 11,
                outline: "none",
                width: "100%",
                marginTop: 4,
              }}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (v{t.version})
                </option>
              ))}
            </select>
          ) : (
            <input
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              placeholder="Paste a template id…"
              style={{
                background: C.s1,
                border: `1px solid ${C.br}`,
                padding: "6px 9px",
                borderRadius: 4,
                color: C.t1,
                fontFamily: M,
                fontSize: 11,
                outline: "none",
                width: "100%",
                marginTop: 4,
              }}
            />
          )}
        </div>
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
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !templateId}
            style={{
              background: templateId ? C.bl : C.br,
              color: C.bg,
              border: "none",
              padding: "6px 18px",
              borderRadius: 4,
              cursor: submitting ? "wait" : templateId ? "pointer" : "default",
              fontFamily: F,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            {submitting ? "Issuing…" : "Issue"}
          </button>
        </div>
      </div>
    </div>
  );
};
