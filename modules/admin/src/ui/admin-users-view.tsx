/**
 * AdminUsersView — list of every User in the org with actions.
 *
 * Permission-gated upstream by /admin/users (admin:manage_users only).
 * Per-row actions live in a small dropdown menu and call the
 * matching /api/admin/users/* endpoint; on success we refetch the
 * page rather than mutating local state, so audit-log writes are
 * always reflected.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Card, Pill, SH, C, F, M } from "@aegis/ui";
import type { RoleSummary, UserStatus, UserSummary } from "../internal/types";
import { ROLE_BADGE_COLORS } from "../internal/services/role-catalog";

const STATUS_COLOR: Record<UserStatus, string> = {
  ACTIVE: C.gn,
  SUSPENDED: C.rd,
  PENDING_INVITE: C.am,
};

const STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  PENDING_INVITE: "Pending invite",
};

function avatarInitials(name: string, email: string): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0]! + parts[1][0]!).toUpperCase();
  }
  return src.slice(0, 2).toUpperCase();
}

const inputStyle: React.CSSProperties = {
  background: C.s1,
  border: `1px solid ${C.br}`,
  padding: "5px 9px",
  borderRadius: 4,
  color: C.t1,
  fontFamily: M,
  fontSize: 11,
  outline: "none",
};

export interface AdminUsersViewProps {
  endpoint?: string;
  rolesEndpoint?: string;
}

export const AdminUsersView: React.FC<AdminUsersViewProps> = ({
  endpoint = "/api/admin/users",
  rolesEndpoint = "/api/admin/roles",
}) => {
  const [rows, setRows] = useState<UserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserStatus | "">("");
  const [roleFilter, setRoleFilter] = useState("");
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [inviteOpen, setInviteOpen] = useState(false);

  // Selected user id whose action menu is open / drawer is showing.
  const [activityFor, setActivityFor] = useState<UserSummary | null>(null);

  useEffect(() => {
    fetch(rolesEndpoint)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((roles: RoleSummary[]) => setRoles(roles))
      .catch(() => setRoles([]));
  }, [rolesEndpoint]);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.set("search", search.trim());
    if (statusFilter) p.set("status", statusFilter);
    if (roleFilter) p.set("roleId", roleFilter);
    p.set("page", String(page));
    return p.toString();
  }, [search, statusFilter, roleFilter, page]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`${endpoint}?${queryString}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((j: { rows: UserSummary[]; total: number }) => {
        if (!alive) return;
        setRows(j.rows);
        setTotal(j.total);
        setError(null);
      })
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [endpoint, queryString, reloadKey]);

  function reload() {
    setReloadKey((k) => k + 1);
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
          <SH icon="◈" title="Users" sub={`${total} users in this organization`} />
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            style={{
              background: C.bl,
              border: "none",
              color: C.bg,
              padding: "8px 14px",
              fontFamily: F,
              fontWeight: 700,
              fontSize: 11,
              borderRadius: 4,
              cursor: "pointer",
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            + Invite user
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, marginTop: 10 }}>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name or email…"
            style={inputStyle}
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as UserStatus | "");
              setPage(1);
            }}
            style={inputStyle}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="PENDING_INVITE">Pending invite</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            style={inputStyle}
          >
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card>
        {error && (
          <div style={{ color: C.rd, fontSize: 11, marginBottom: 8 }}>{error}</div>
        )}
        {loading && rows.length === 0 ? (
          <div style={{ color: C.t3, fontSize: 11, fontFamily: M }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ color: C.t3, fontSize: 11 }}>No users match.</div>
        ) : (
          <div style={{ display: "grid", gap: 0 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1.2fr 110px 110px 110px 60px",
                padding: "7px 10px",
                fontSize: 9.5,
                fontWeight: 600,
                color: C.t3,
                background: C.s1,
                letterSpacing: 1,
                textTransform: "uppercase",
                fontFamily: F,
                borderBottom: `1px solid ${C.br}33`,
              }}
            >
              <div>Name</div>
              <div>Email</div>
              <div>Role</div>
              <div>Last active</div>
              <div>Status</div>
              <div></div>
            </div>
            {rows.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                roles={roles}
                onChanged={reload}
                onShowActivity={() => setActivityFor(u)}
                endpoint={endpoint}
              />
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
                style={pagerStyle(page === 1)}
              >
                Prev
              </button>
              <button
                type="button"
                disabled={page * 50 >= total}
                onClick={() => setPage((p) => p + 1)}
                style={{ ...pagerStyle(page * 50 >= total), marginLeft: 6 }}
              >
                Next
              </button>
            </span>
          </div>
        )}
      </Card>

      {inviteOpen && (
        <InviteUserDialog
          roles={roles}
          endpoint={endpoint}
          onClose={() => setInviteOpen(false)}
          onCreated={() => {
            setInviteOpen(false);
            reload();
          }}
        />
      )}

      {activityFor && (
        <UserActivityDrawer
          user={activityFor}
          endpoint={endpoint}
          onClose={() => setActivityFor(null)}
        />
      )}
    </div>
  );
};

function pagerStyle(disabled: boolean): React.CSSProperties {
  return {
    background: "transparent",
    border: `1px solid ${C.br}`,
    color: disabled ? C.t4 : C.t1,
    padding: "2px 10px",
    borderRadius: 4,
    cursor: disabled ? "default" : "pointer",
    fontFamily: M,
    fontSize: 10,
  };
}

// ── User row ──────────────────────────────────────────────────────

const UserRow: React.FC<{
  user: UserSummary;
  roles: RoleSummary[];
  onChanged: () => void;
  onShowActivity: () => void;
  endpoint: string;
}> = ({ user: u, roles, onChanged, onShowActivity, endpoint }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(path: string, init?: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(path, init);
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`HTTP ${r.status}: ${text}`);
      }
      onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  }

  const lastLogin = u.lastLoginAt
    ? new Date(u.lastLoginAt).toISOString().slice(0, 10)
    : "—";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1.2fr 110px 110px 110px 60px",
        padding: "8px 10px",
        fontSize: 11,
        borderBottom: `1px solid ${C.br}22`,
        fontFamily: F,
        color: C.t1,
        alignItems: "center",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background:
              u.roleName && ROLE_BADGE_COLORS[u.roleName]
                ? `${ROLE_BADGE_COLORS[u.roleName]}33`
                : C.br,
            color: u.roleName ? ROLE_BADGE_COLORS[u.roleName] : C.t2,
            fontFamily: M,
            fontSize: 9,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {avatarInitials(u.name, u.email)}
        </div>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {u.name || u.email}
        </span>
      </div>
      <div style={{ fontFamily: M, fontSize: 10.5, color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {u.email}
      </div>
      <div>
        {editingRole ? (
          <select
            autoFocus
            disabled={busy}
            defaultValue={u.roleId ?? ""}
            onChange={(e) => {
              const newRoleId = e.target.value;
              setEditingRole(false);
              if (newRoleId && newRoleId !== u.roleId) {
                call(`${endpoint}/${u.id}/role`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ roleId: newRoleId }),
                });
              }
            }}
            onBlur={() => setEditingRole(false)}
            style={inputStyle}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        ) : u.roleName ? (
          <Pill t={u.roleName} c={ROLE_BADGE_COLORS[u.roleName]} />
        ) : (
          <span style={{ color: C.t4, fontSize: 10, fontFamily: M }}>—</span>
        )}
      </div>
      <div style={{ fontFamily: M, fontSize: 10, color: C.t3 }}>{lastLogin}</div>
      <div>
        <Pill t={STATUS_LABEL[u.status]} c={STATUS_COLOR[u.status]} />
      </div>
      <div style={{ position: "relative", textAlign: "right" }}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          style={{
            background: "transparent",
            border: `1px solid ${C.br}`,
            color: C.t2,
            padding: "2px 8px",
            borderRadius: 4,
            fontFamily: M,
            fontSize: 12,
            cursor: "pointer",
            lineHeight: "12px",
          }}
        >
          ⋯
        </button>
        {menuOpen && (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 24,
              background: C.cd,
              border: `1px solid ${C.brL}`,
              borderRadius: 4,
              minWidth: 160,
              boxShadow: "0 4px 12px rgba(0,0,0,.4)",
              zIndex: 10,
              fontFamily: F,
              fontSize: 11,
            }}
          >
            <MenuItem onClick={() => { setMenuOpen(false); setEditingRole(true); }}>
              Edit role
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMenuOpen(false);
                onShowActivity();
              }}
            >
              View activity
            </MenuItem>
            {u.status !== "SUSPENDED" ? (
              <MenuItem
                danger
                onClick={() => call(`${endpoint}/${u.id}/suspend`, { method: "POST" })}
              >
                Suspend
              </MenuItem>
            ) : (
              <MenuItem
                onClick={() => call(`${endpoint}/${u.id}/reactivate`, { method: "POST" })}
              >
                Reactivate
              </MenuItem>
            )}
          </div>
        )}
        {error && (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 32,
              background: C.rdG,
              border: `1px solid ${C.rd}`,
              padding: 6,
              fontSize: 10,
              fontFamily: M,
              color: C.rd,
              maxWidth: 320,
              borderRadius: 4,
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

const MenuItem: React.FC<{
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}> = ({ onClick, danger, children }) => (
  <div
    onClick={onClick}
    style={{
      padding: "8px 12px",
      cursor: "pointer",
      color: danger ? C.rd : C.t1,
      borderBottom: `1px solid ${C.br}22`,
    }}
    onMouseEnter={(e) => (e.currentTarget.style.background = C.cdH)}
    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
  >
    {children}
  </div>
);

// ── Invite dialog ────────────────────────────────────────────────

const InviteUserDialog: React.FC<{
  roles: RoleSummary[];
  endpoint: string;
  onClose: () => void;
  onCreated: () => void;
}> = ({ roles, endpoint, onClose, onCreated }) => {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim(), roleId }),
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`HTTP ${r.status}: ${text}`);
      }
      onCreated();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.65)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.cd,
          border: `1px solid ${C.brL}`,
          padding: 18,
          minWidth: 420,
          fontFamily: F,
          color: C.t1,
        }}
      >
        <SH icon="✉" title="Invite user" sub="Creates a User row; provision via Auth0 dashboard for now" />
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <div>
            <label style={{ fontSize: 10, color: C.t3, fontFamily: F }}>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ ...inputStyle, width: "100%" }}
            />
          </div>
          <div>
            <label style={{ fontSize: 10, color: C.t3, fontFamily: F }}>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="(optional — falls back to email)"
              style={{ ...inputStyle, width: "100%" }}
            />
          </div>
          <div>
            <label style={{ fontSize: 10, color: C.t3, fontFamily: F }}>Role</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              style={{ ...inputStyle, width: "100%" }}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          {error && <div style={{ color: C.rd, fontSize: 11, fontFamily: M }}>{error}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
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
              type="submit"
              disabled={submitting || !email.trim() || !roleId}
              style={{
                background: email.trim() && roleId ? C.bl : C.br,
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
              {submitting ? "Inviting…" : "Invite"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

// ── Activity drawer ──────────────────────────────────────────────

interface ActivityRow {
  id: string;
  chainPosition: string;
  timestamp: string;
  action: string;
  resourceType: string;
  resourceId: string;
}

const UserActivityDrawer: React.FC<{
  user: UserSummary;
  endpoint: string;
  onClose: () => void;
}> = ({ user: u, endpoint, onClose }) => {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);

  useEffect(() => {
    fetch(`${endpoint}/${u.id}/activity`)
      .then((r) => r.json())
      .then(setRows)
      .catch(() => setRows([]));
  }, [endpoint, u.id]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.65)",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 480,
          background: C.cd,
          borderLeft: `1px solid ${C.brL}`,
          padding: 18,
          overflowY: "auto",
          fontFamily: F,
          color: C.t1,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <SH icon="◇" title="User activity" sub={`Last 50 audit rows · ${u.email}`} />
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: `1px solid ${C.br}`,
              color: C.t2,
              padding: "2px 8px",
              borderRadius: 4,
              cursor: "pointer",
              fontFamily: M,
              fontSize: 11,
            }}
          >
            ✕
          </button>
        </div>
        {!rows && <div style={{ color: C.t3, fontSize: 11, fontFamily: M }}>Loading…</div>}
        {rows && rows.length === 0 && (
          <div style={{ color: C.t3, fontSize: 11 }}>No activity yet.</div>
        )}
        {rows && rows.length > 0 && (
          <div style={{ display: "grid", gap: 4, marginTop: 10 }}>
            {rows.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "60px 130px 1fr",
                  fontSize: 10.5,
                  fontFamily: M,
                  color: C.t1,
                  padding: "4px 6px",
                  borderBottom: `1px solid ${C.br}22`,
                }}
              >
                <span style={{ color: C.t4 }}>#{r.chainPosition}</span>
                <span style={{ color: C.t3 }}>
                  {new Date(r.timestamp).toISOString().replace("T", " ").slice(0, 16)}
                </span>
                <span style={{ color: C.tl }}>
                  {r.action}{" "}
                  <span style={{ color: C.t4 }}>
                    {r.resourceType}/{r.resourceId.slice(0, 16)}…
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
