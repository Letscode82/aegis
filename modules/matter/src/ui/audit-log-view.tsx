/**
 * AuditLogView — filterable view + chain verify + defensibility export.
 *
 * Permission-gated upstream by /audit-log page (audit:read_all only).
 * The verify button calls /api/audit-log/verify, the export button
 * triggers a download of the PDF; both render a status panel above
 * the row table.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Card, Pill, SH, C, F, M } from "@aegis/ui";
import type { AuditLogDTO, ChainVerificationDTO } from "./types";

export interface AuditLogViewProps {
  endpoint?: string;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({
  endpoint = "/api/audit-log",
}) => {
  const [rows, setRows] = useState<AuditLogDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [resourceType, setResourceType] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [actorId, setActorId] = useState("");
  const [verification, setVerification] = useState<ChainVerificationDTO | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [exportingState, setExportingState] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    if (resourceType.trim()) p.set("resourceType", resourceType.trim());
    if (actionFilter.trim()) p.set("action", actionFilter.trim());
    if (actorId.trim()) p.set("actorId", actorId.trim());
    return p.toString();
  }, [page, resourceType, actionFilter, actorId]);

  useEffect(() => {
    let alive = true;
    fetch(`${endpoint}?${queryString}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then(
        (json: { rows: AuditLogDTO[]; total: number }) => {
          if (alive) {
            setRows(json.rows);
            setTotal(json.total);
            setError(null);
          }
        },
      )
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [endpoint, queryString]);

  async function verify() {
    setVerifying(true);
    setError(null);
    try {
      const r = await fetch(`${endpoint}/verify`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const v: ChainVerificationDTO = await r.json();
      setVerification(v);
    } catch (e) {
      setError(String(e));
    } finally {
      setVerifying(false);
    }
  }

  async function exportReport() {
    setExportingState(true);
    setError(null);
    try {
      const r = await fetch(`${endpoint}/export`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aegis-audit-defensibility-${new Date().toISOString().slice(0, 19)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(String(e));
    } finally {
      setExportingState(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14, padding: 14 }}>
      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <SH
            icon="🔐"
            title="AuditLog"
            sub="Cryptographically chained · per-org append-only"
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={verify}
              disabled={verifying}
              style={{
                background: "transparent",
                border: `1px solid ${C.bl}`,
                color: C.bl,
                padding: "6px 12px",
                borderRadius: 4,
                fontFamily: F,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                letterSpacing: 0.3,
              }}
            >
              {verifying ? "Verifying…" : "Verify chain"}
            </button>
            <button
              type="button"
              onClick={exportReport}
              disabled={exportingState}
              style={{
                background: C.bl,
                border: "none",
                color: C.bg,
                padding: "6px 12px",
                borderRadius: 4,
                fontFamily: F,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                letterSpacing: 0.3,
              }}
            >
              {exportingState ? "Generating PDF…" : "Export defensibility report"}
            </button>
          </div>
        </div>

        {verification && (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              border: `1px solid ${verification.intact ? C.gn : C.rd}`,
              background: verification.intact ? C.gnG : C.rdG,
              borderRadius: 6,
              fontSize: 11,
              color: C.t1,
              fontFamily: M,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Pill
                t={verification.intact ? "INTACT" : "BROKEN"}
                c={verification.intact ? C.gn : C.rd}
              />
              <span>
                {verification.rowsChecked} rows checked in {verification.elapsedMs}ms
              </span>
            </div>
            <div style={{ marginTop: 6, color: C.t3 }}>
              Head hash: {verification.headHash?.slice(0, 24) ?? "(empty)"}…
            </div>
            {!verification.intact && (
              <div style={{ marginTop: 6, color: C.rd }}>
                {verification.breaks.length} break(s):
                <ul style={{ margin: "4px 0 0 18px" }}>
                  {verification.breaks.map((b, i) => (
                    <li key={i}>
                      pos={b.chainPosition} {b.reason}: {b.details}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
            marginTop: 10,
          }}
        >
          <input
            placeholder="Resource type (Matter, IntakeTicket, …)"
            value={resourceType}
            onChange={(e) => {
              setResourceType(e.target.value);
              setPage(1);
            }}
            style={{
              background: C.s1,
              border: `1px solid ${C.br}`,
              padding: "5px 9px",
              borderRadius: 4,
              color: C.t1,
              fontFamily: M,
              fontSize: 11,
              outline: "none",
            }}
          />
          <input
            placeholder="Action (matter.created, intake.recommendation.approved, …)"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            style={{
              background: C.s1,
              border: `1px solid ${C.br}`,
              padding: "5px 9px",
              borderRadius: 4,
              color: C.t1,
              fontFamily: M,
              fontSize: 11,
              outline: "none",
            }}
          />
          <input
            placeholder="Actor user id"
            value={actorId}
            onChange={(e) => {
              setActorId(e.target.value);
              setPage(1);
            }}
            style={{
              background: C.s1,
              border: `1px solid ${C.br}`,
              padding: "5px 9px",
              borderRadius: 4,
              color: C.t1,
              fontFamily: M,
              fontSize: 11,
              outline: "none",
            }}
          />
        </div>
      </Card>

      <Card>
        {error && (
          <div style={{ color: C.rd, fontSize: 11, marginBottom: 8 }}>{error}</div>
        )}
        {rows.length === 0 ? (
          <div style={{ color: C.t3, fontSize: 11 }}>No audit rows match.</div>
        ) : (
          <div style={{ display: "grid", gap: 0 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "60px 150px 200px 1fr 130px",
                padding: "6px 8px",
                background: C.s1,
                fontSize: 9.5,
                fontWeight: 600,
                color: C.t3,
                fontFamily: F,
                textTransform: "uppercase",
                letterSpacing: 1,
                borderBottom: `1px solid ${C.br}22`,
              }}
            >
              <div>#pos</div>
              <div>When</div>
              <div>Action</div>
              <div>Resource / actor</div>
              <div>Hash</div>
            </div>
            {rows.map((row) => (
              <div
                key={row.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "60px 150px 200px 1fr 130px",
                  padding: "5px 8px",
                  fontSize: 10.5,
                  borderBottom: `1px solid ${C.br}22`,
                  fontFamily: M,
                  color: C.t1,
                }}
              >
                <div style={{ color: C.t4 }}>#{row.chainPosition}</div>
                <div style={{ color: C.t3 }}>
                  {new Date(row.timestamp).toISOString().replace("T", " ").slice(0, 16)}
                </div>
                <div style={{ color: C.tl }}>{row.action}</div>
                <div style={{ color: C.t2 }}>
                  {row.resourceType}/{row.resourceId} · {row.actorType}:
                  {row.actorId ?? "system"}
                </div>
                <div style={{ color: C.t4, fontSize: 9 }}>
                  {row.contentHash.slice(0, 16)}…
                </div>
              </div>
            ))}
          </div>
        )}

        {total > 50 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 10,
              fontSize: 10.5,
              color: C.t3,
              fontFamily: M,
            }}
          >
            <span>
              {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of {total}
            </span>
            <span>
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.br}`,
                  color: page === 1 ? C.t4 : C.t1,
                  padding: "2px 10px",
                  borderRadius: 4,
                  marginRight: 6,
                  cursor: page === 1 ? "default" : "pointer",
                  fontFamily: M,
                  fontSize: 10,
                }}
              >
                Prev
              </button>
              <button
                type="button"
                disabled={page * 50 >= total}
                onClick={() => setPage((p) => p + 1)}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.br}`,
                  color: page * 50 >= total ? C.t4 : C.t1,
                  padding: "2px 10px",
                  borderRadius: 4,
                  cursor: page * 50 >= total ? "default" : "pointer",
                  fontFamily: M,
                  fontSize: 10,
                }}
              >
                Next
              </button>
            </span>
          </div>
        )}
      </Card>
    </div>
  );
};
