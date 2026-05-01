/**
 * UserBadge — top-right identity widget.
 *
 * Renders the resolved current user's name (or email fallback), a
 * role-coloured badge, and a small click-out menu with a Logout
 * action that hits Auth0's catch-all at /api/auth/logout. Hidden
 * while the auth resolution is loading and when no user is present
 * (dev mode without Auth0 falls through to the seeded admin so this
 * stays visible there too).
 *
 * The role badge palette mirrors @aegis/admin's ROLE_BADGE_COLORS so
 * the same colour identifies a role in the admin Users list and in
 * the top bar.
 */
import { useEffect, useRef, useState } from "react";
import { C, F, M } from "@aegis/ui";
import { useCurrentUser } from "@aegis/auth/react";

const ROLE_COLORS = {
  admin: "#C8463D",
  gc: "#E8793B",
  attorney: "#6B8EC4",
  paralegal: "#6BA4A4",
  legal_ops: "#A06C9A",
  requester: "#8B93AE",
  external_counsel: "#5A6380",
  viewer: "#7FA780",
};

function initials(name, email) {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return src.slice(0, 2).toUpperCase();
}

export function UserBadge() {
  const { user, loading } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (loading || !user) return null;

  const role = user.roleName;
  const badgeColor = role && ROLE_COLORS[role] ? ROLE_COLORS[role] : C.t3;
  const display = (user.name || user.email).trim();

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 10px 5px 6px",
          border: `1px solid ${C.br}`,
          borderRadius: 18,
          cursor: "pointer",
          background: open ? C.cdH : "transparent",
          transition: "background .12s, border-color .12s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.brL)}
        onMouseLeave={(e) =>
          (e.currentTarget.style.borderColor = open ? C.brL : C.br)
        }
        title={`${display}${role ? ` · ${role}` : ""}`}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: `${badgeColor}33`,
            color: badgeColor,
            fontFamily: M,
            fontSize: 9,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {initials(user.name, user.email)}
        </span>
        <span
          style={{
            fontSize: 10.5,
            color: C.t1,
            fontFamily: F,
            maxWidth: 140,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {display}
        </span>
        {role && (
          <span
            style={{
              fontSize: 9,
              fontFamily: M,
              fontWeight: 600,
              color: badgeColor,
              background: `${badgeColor}1f`,
              padding: "1px 6px",
              borderRadius: 3,
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            {role}
          </span>
        )}
        <span style={{ fontSize: 9, color: C.t3, fontFamily: M }}>{open ? "▴" : "▾"}</span>
      </div>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 38,
            background: C.cd,
            border: `1px solid ${C.brL}`,
            borderRadius: 4,
            minWidth: 200,
            zIndex: 30,
            boxShadow: "0 4px 14px rgba(0,0,0,.4)",
            fontFamily: F,
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              borderBottom: `1px solid ${C.br}33`,
              fontSize: 10.5,
              color: C.t2,
              fontFamily: M,
            }}
          >
            <div style={{ color: C.t1, marginBottom: 2 }}>{display}</div>
            <div style={{ color: C.t3, fontSize: 9.5 }}>{user.email}</div>
            {Array.isArray(user.permissions) && (
              <div style={{ color: C.t4, fontSize: 9, marginTop: 4 }}>
                {user.permissions.length} permission
                {user.permissions.length === 1 ? "" : "s"}
              </div>
            )}
          </div>
          {/*
            * Auth0's logout endpoint clears the session cookie and
            * redirects to the configured post-logout URL — that's a
            * full navigation, not a client-side route, so we use
            * window.location rather than next/link.
            */}
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.href = "/api/auth/logout";
              }
            }}
            style={{
              display: "block",
              width: "100%",
              padding: "8px 12px",
              fontSize: 11,
              color: C.t1,
              fontFamily: F,
              textAlign: "left",
              border: "none",
              background: "transparent",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = C.cdH)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
