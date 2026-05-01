/**
 * AdminRolesView — list of canonical roles, click into RoleDetailEditor.
 *
 * Permission-gated upstream by /admin/roles (admin:manage_roles only).
 * Keeps the v8 cockpit visual rhythm — one card per role, right-aligned
 * counts, color-coded badge on the left.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Card, Pill, SH, C, F, M } from "@aegis/ui";
import type {
  Permission,
  RoleDetail,
  RoleSummary,
  UserSummary,
} from "../internal/types";
import {
  PERMISSION_GROUPS,
  ROLE_BADGE_COLORS,
  permissionLabel,
} from "../internal/services/role-catalog";

export interface AdminRolesViewProps {
  endpoint?: string;
}

export const AdminRolesView: React.FC<AdminRolesViewProps> = ({
  endpoint = "/api/admin/roles",
}) => {
  const [roles, setRoles] = useState<RoleSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    fetch(endpoint)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then(setRoles)
      .catch(() => setRoles([]));
  }, [endpoint, reloadKey]);

  if (selected) {
    return (
      <RoleDetailEditor
        roleId={selected}
        endpoint={endpoint}
        onClose={() => {
          setSelected(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  return (
    <div style={{ display: "grid", gap: 14, padding: 14 }}>
      <Card>
        <SH
          icon="◆"
          title="Roles"
          sub="8 canonical roles · permission grants are audit-chained"
        />
      </Card>

      {!roles && (
        <Card>
          <div style={{ color: C.t3, fontSize: 11, fontFamily: M }}>Loading…</div>
        </Card>
      )}

      {roles &&
        roles.map((r) => (
          <Card key={r.id}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center", flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: `${ROLE_BADGE_COLORS[r.name]}22`,
                    color: ROLE_BADGE_COLORS[r.name],
                    fontFamily: M,
                    fontSize: 13,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {r.name.slice(0, 2).toUpperCase()}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: F, fontWeight: 700, fontSize: 14, color: C.t1, marginBottom: 2 }}>
                    {r.name}{" "}
                    <Pill t={`${r.permissionCount} perms`} c={ROLE_BADGE_COLORS[r.name]} />{" "}
                    <Pill t={`${r.memberCount} member${r.memberCount === 1 ? "" : "s"}`} c={C.t3} />
                  </div>
                  <div style={{ fontSize: 11, color: C.t3, fontFamily: F }}>
                    {r.description}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(r.id)}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.br}`,
                  color: C.t1,
                  padding: "6px 14px",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontFamily: F,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                  flexShrink: 0,
                }}
              >
                Edit
              </button>
            </div>
          </Card>
        ))}
    </div>
  );
};

// ── RoleDetailEditor ──────────────────────────────────────────────

const RoleDetailEditor: React.FC<{
  roleId: string;
  endpoint: string;
  onClose: () => void;
}> = ({ roleId, endpoint, onClose }) => {
  const [role, setRole] = useState<RoleDetail | null>(null);
  const [working, setWorking] = useState<Set<Permission> | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${endpoint}/${roleId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d: RoleDetail) => {
        setRole(d);
        setWorking(new Set<Permission>(d.permissions));
      })
      .catch((e) => setError(String(e)));
  }, [endpoint, roleId]);

  const isAdmin = role?.name === "admin";

  const dirty = useMemo(() => {
    if (!role || !working) return false;
    if (working.size !== role.permissions.length) return true;
    return role.permissions.some((p) => !working.has(p));
  }, [role, working]);

  function toggle(p: Permission) {
    if (!working) return;
    if (isAdmin) return; // admin role permissions are immutable in the UI
    const next = new Set(working);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setWorking(next);
  }

  async function save() {
    if (!role || !working) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`${endpoint}/${roleId}/permissions`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ permissions: Array.from(working) }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  if (error && !role) {
    return (
      <Card>
        <div style={{ color: C.rd, fontSize: 11, fontFamily: M, padding: 14 }}>
          {error}
        </div>
      </Card>
    );
  }

  if (!role || !working) {
    return (
      <Card>
        <div style={{ color: C.t3, fontSize: 11, fontFamily: M, padding: 14 }}>
          Loading…
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14, padding: 14 }}>
      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 14,
          }}
        >
          <div>
            <div
              onClick={onClose}
              style={{
                fontSize: 10,
                color: C.t3,
                fontFamily: M,
                cursor: "pointer",
                marginBottom: 6,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              ← All roles
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: `${ROLE_BADGE_COLORS[role.name]}22`,
                  color: ROLE_BADGE_COLORS[role.name],
                  fontFamily: M,
                  fontSize: 11,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {role.name.slice(0, 2).toUpperCase()}
              </span>
              <span style={{ fontFamily: F, fontWeight: 700, fontSize: 18, color: C.t1 }}>
                {role.name}
              </span>
              <Pill t={`${working.size} perms`} c={ROLE_BADGE_COLORS[role.name]} />
              <Pill t={`${role.memberCount} member${role.memberCount === 1 ? "" : "s"}`} c={C.t3} />
            </div>
            <div style={{ fontSize: 12, color: C.t2, marginTop: 6, maxWidth: 720 }}>
              {role.description}
            </div>
            {isAdmin && (
              <div
                style={{
                  fontSize: 10.5,
                  color: C.am,
                  marginTop: 8,
                  fontFamily: M,
                  letterSpacing: 0.3,
                }}
              >
                The admin role must carry every permission. Toggles are
                read-only; module-load and runtime guards enforce this
                invariant.
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
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
              onClick={save}
              disabled={saving || !dirty || isAdmin}
              style={{
                background: dirty && !isAdmin ? C.bl : C.br,
                border: "none",
                color: C.bg,
                padding: "6px 18px",
                borderRadius: 4,
                cursor: dirty && !isAdmin ? (saving ? "wait" : "pointer") : "default",
                fontFamily: F,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
        {error && (
          <div style={{ color: C.rd, fontSize: 11, fontFamily: M, marginTop: 8 }}>
            {error}
          </div>
        )}
      </Card>

      {PERMISSION_GROUPS.map((g) => {
        const open = !collapsed.has(g.domain);
        const groupGranted = g.permissions.filter((p) => working.has(p)).length;
        return (
          <Card key={g.domain}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                cursor: "pointer",
                alignItems: "center",
              }}
              onClick={() =>
                setCollapsed((s) => {
                  const next = new Set(s);
                  if (next.has(g.domain)) next.delete(g.domain);
                  else next.add(g.domain);
                  return next;
                })
              }
            >
              <div>
                <div
                  style={{
                    fontFamily: F,
                    fontWeight: 700,
                    fontSize: 12,
                    color: C.bl,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    marginBottom: 2,
                  }}
                >
                  {g.domain}{" "}
                  <span style={{ color: C.t4, fontWeight: 500, fontSize: 10 }}>
                    {groupGranted}/{g.permissions.length}
                  </span>
                </div>
                <div style={{ fontSize: 10.5, color: C.t3 }}>{g.description}</div>
              </div>
              <span style={{ fontSize: 14, color: C.t3, fontFamily: M }}>
                {open ? "▾" : "▸"}
              </span>
            </div>
            {open && (
              <div style={{ marginTop: 10, display: "grid", gap: 4 }}>
                {g.permissions.map((p) => {
                  const granted = working.has(p);
                  const wasGranted = role.permissions.includes(p);
                  // members who would lose this if it's removed
                  const losers =
                    wasGranted && !granted ? role.memberCount : 0;
                  return (
                    <div
                      key={p}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "32px 1fr auto",
                        gap: 10,
                        alignItems: "center",
                        padding: "6px 4px",
                        borderBottom: `1px solid ${C.br}22`,
                      }}
                    >
                      <Toggle
                        on={granted}
                        disabled={isAdmin}
                        onClick={() => toggle(p)}
                      />
                      <div>
                        <div
                          style={{
                            fontSize: 11,
                            color: granted ? C.t1 : C.t3,
                            fontFamily: F,
                          }}
                        >
                          {permissionLabel(p)}
                        </div>
                        <div style={{ fontSize: 9.5, color: C.t4, fontFamily: M }}>
                          {String(p)}
                        </div>
                      </div>
                      {losers > 0 && (
                        <div
                          style={{
                            fontSize: 9.5,
                            color: C.am,
                            fontFamily: M,
                            letterSpacing: 0.3,
                            textAlign: "right",
                          }}
                        >
                          will remove from {losers} member
                          {losers === 1 ? "" : "s"}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}

      {/* Members */}
      <Card>
        <SH icon="◇" title={`Members (${role.members.length})`} />
        {role.members.length === 0 ? (
          <div style={{ color: C.t3, fontSize: 11, fontFamily: M }}>
            No users have this role.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 4 }}>
            {role.members.map((m: UserSummary) => (
              <div
                key={m.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 110px",
                  fontSize: 11,
                  padding: "5px 6px",
                  borderBottom: `1px solid ${C.br}22`,
                  fontFamily: F,
                  color: C.t1,
                }}
              >
                <span>{m.name || m.email}</span>
                <span style={{ fontFamily: M, color: C.t3, fontSize: 10.5 }}>
                  {m.email}
                </span>
                <span
                  style={{
                    fontFamily: M,
                    color: m.suspendedAt ? C.rd : C.t3,
                    fontSize: 10,
                  }}
                >
                  {m.suspendedAt ? "Suspended" : m.lastLoginAt ? "Active" : "Pending invite"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

const Toggle: React.FC<{
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}> = ({ on, disabled, onClick }) => (
  <span
    onClick={disabled ? undefined : onClick}
    style={{
      width: 28,
      height: 16,
      borderRadius: 8,
      background: on ? C.gn : C.br,
      position: "relative",
      cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.5 : 1,
      transition: "background .15s",
      display: "inline-block",
    }}
  >
    <span
      style={{
        position: "absolute",
        left: on ? 14 : 2,
        top: 2,
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: C.bg,
        transition: "left .15s",
      }}
    />
  </span>
);
