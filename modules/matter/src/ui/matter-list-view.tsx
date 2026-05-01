/**
 * MatterListView — paginated table with status / type filters and search.
 *
 * Reads /api/matter/list with the active filter as query params. The
 * filter UI is kept compact to match the v8 cockpit aesthetic; the
 * row click navigates to /matter/{id} via the parent-supplied
 * onSelect callback (apps/web wires Next.js navigation).
 */
import React, { useEffect, useMemo, useState } from "react";
import { Card, Pill, SH, C, F, M } from "@aegis/ui";
import type { MatterDTO, MatterStatus, MatterType } from "./types";

const STATUSES: MatterStatus[] = [
  "DRAFT",
  "OPEN",
  "ACTIVE",
  "STAYED",
  "CLOSED",
  "ARCHIVED",
];

const TYPES: MatterType[] = [
  "LITIGATION",
  "TRANSACTIONAL",
  "MA",
  "IP",
  "EMPLOYMENT",
  "REGULATORY",
  "INVESTIGATION",
  "ADVISORY",
  "OTHER",
];

const STATUS_COLOR: Record<MatterStatus, string> = {
  DRAFT: C.t3,
  OPEN: C.bl,
  ACTIVE: C.gn,
  STAYED: C.am,
  CLOSED: C.t4,
  ARCHIVED: C.t4,
};

export interface MatterListViewProps {
  endpoint?: string;
  onSelect?: (matterId: string) => void;
  onCreate?: () => void;
}

export const MatterListView: React.FC<MatterListViewProps> = ({
  endpoint = "/api/matter/list",
  onSelect,
  onCreate,
}) => {
  const [statusFilter, setStatusFilter] = useState<MatterStatus[]>([]);
  const [typeFilter, setTypeFilter] = useState<MatterType[]>([]);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<MatterDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    statusFilter.forEach((s) => params.append("status", s));
    typeFilter.forEach((t) => params.append("type", t));
    if (search.trim()) params.set("q", search.trim());
    params.set("page", String(page));
    return params.toString();
  }, [statusFilter, typeFilter, search, page]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`${endpoint}?${queryString}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((json: { rows: MatterDTO[]; total: number }) => {
        if (!alive) return;
        setRows(json.rows);
        setTotal(json.total);
        setError(null);
      })
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [endpoint, queryString]);

  function toggle<T>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  return (
    <div style={{ display: "grid", gap: 14, padding: 14 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <SH icon="🗂" title="Matter list" sub={`${total} matters`} />
          {onCreate && (
            <button
              type="button"
              onClick={onCreate}
              style={{
                background: C.bl,
                border: "none",
                color: C.bg,
                fontFamily: F,
                fontWeight: 700,
                fontSize: 11,
                padding: "8px 14px",
                borderRadius: 5,
                cursor: "pointer",
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              + New matter
            </button>
          )}
        </div>

        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search title, description, matter number…"
            style={{
              background: C.s1,
              border: `1px solid ${C.br}`,
              padding: "6px 10px",
              borderRadius: 5,
              color: C.t1,
              fontFamily: M,
              fontSize: 11,
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 9.5, color: C.t3, fontFamily: F, alignSelf: "center", marginRight: 6 }}>
              STATUS
            </span>
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setStatusFilter(toggle(statusFilter, s));
                  setPage(1);
                }}
                style={{
                  background: statusFilter.includes(s) ? STATUS_COLOR[s] : "transparent",
                  border: `1px solid ${STATUS_COLOR[s]}`,
                  color: statusFilter.includes(s) ? C.bg : STATUS_COLOR[s],
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: 9.5,
                  fontWeight: 600,
                  fontFamily: M,
                  cursor: "pointer",
                  letterSpacing: 0.3,
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 9.5, color: C.t3, fontFamily: F, alignSelf: "center", marginRight: 6 }}>
              TYPE
            </span>
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTypeFilter(toggle(typeFilter, t));
                  setPage(1);
                }}
                style={{
                  background: typeFilter.includes(t) ? C.bl : "transparent",
                  border: `1px solid ${C.bl}`,
                  color: typeFilter.includes(t) ? C.bg : C.bl,
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: 9.5,
                  fontWeight: 600,
                  fontFamily: M,
                  cursor: "pointer",
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        {error && (
          <div style={{ color: C.rd, fontSize: 11, marginBottom: 8 }}>
            {error}
          </div>
        )}
        {loading && rows.length === 0 ? (
          <div style={{ color: C.t3, fontSize: 11, fontFamily: M }}>
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div style={{ color: C.t3, fontSize: 11 }}>
            No matters match the current filter.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 0 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr 100px 120px 100px",
                gap: 0,
                padding: "7px 10px",
                fontSize: 9.5,
                fontWeight: 600,
                color: C.t3,
                background: C.s1,
                letterSpacing: 1,
                textTransform: "uppercase",
                fontFamily: F,
                borderBottom: `1px solid ${C.br}22`,
              }}
            >
              <div>Number</div>
              <div>Title</div>
              <div>Type</div>
              <div>Status</div>
              <div>Opened</div>
            </div>
            {rows.map((m) => (
              <div
                key={m.id}
                onClick={() => onSelect?.(m.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr 100px 120px 100px",
                  padding: "7px 10px",
                  fontSize: 11,
                  borderBottom: `1px solid ${C.br}22`,
                  cursor: onSelect ? "pointer" : "default",
                  color: C.t1,
                  fontFamily: F,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = C.cdH)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ fontFamily: M, color: C.t2, fontSize: 10.5 }}>
                  {m.matterNumber ?? "(draft)"}
                </div>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.title}
                </div>
                <div style={{ fontFamily: M, fontSize: 10, color: C.t3 }}>
                  {m.type}
                </div>
                <div>
                  <Pill t={m.status} c={STATUS_COLOR[m.status]} />
                </div>
                <div style={{ fontFamily: M, fontSize: 10, color: C.t3 }}>
                  {new Date(m.openedAt).toISOString().slice(0, 10)}
                </div>
              </div>
            ))}
          </div>
        )}

        {total > 25 && (
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
              Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} of {total}
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
                disabled={page * 25 >= total}
                onClick={() => setPage((p) => p + 1)}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.br}`,
                  color: page * 25 >= total ? C.t4 : C.t1,
                  padding: "2px 10px",
                  borderRadius: 4,
                  cursor: page * 25 >= total ? "default" : "pointer",
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
