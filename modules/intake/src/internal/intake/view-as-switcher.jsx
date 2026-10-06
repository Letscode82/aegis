import { useState, useEffect, useCallback } from "react";
import { C, M } from "@aegis/ui";

// ── "View as role" switcher (program #4, dev-mode) ───────────────────
//
// Lets a demo operator preview the app as any seeded role user without
// restarting with a different DEV_USER_EMAIL. Picking a user sets the
// aegis_dev_view_as cookie via /api/dev/view-as and reloads — every
// gated surface (nav, permissions, My Work, workflow-step actions) then
// resolves around that user, so each team's view is exactly what they'd
// see when logged in. The endpoint 403s when Auth0 is configured, so
// this control simply doesn't render in a real-auth deployment.

const ROLE_COLORS = {
  admin: C.pp, gc: C.cy, attorney: C.tl, paralegal: C.gn,
  legal_ops: C.am, requester: C.t2, external_counsel: C.em, viewer: C.t3,
};

export function ViewAsSwitcher() {
  const [state, setState] = useState(null); // {enabled,users,current} or null
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/dev/view-as");
      if (r.status === 403) { setState({ enabled: false }); return; }
      const d = await r.json().catch(() => null);
      if (d?.ok) setState(d);
    } catch { /* dev-only affordance — silent */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const pick = async (email) => {
    try {
      await fetch("/api/dev/view-as", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      window.location.reload(); // re-resolve the whole app as this user
    } catch { /* noop */ }
  };

  if (!state || !state.enabled) return null;
  const current = (state.users || []).find((u) => u.email === state.current);

  return (
    <div style={{ position: "relative" }}>
      <div onClick={() => setOpen((o) => !o)} title="Preview the app as another role (dev only)" style={{ padding: "5px 10px", border: `1px solid ${current ? ROLE_COLORS[current.roleName] || C.br : C.br}`, color: current ? ROLE_COLORS[current.roleName] || C.t2 : C.t3, fontSize: 9, fontFamily: M, letterSpacing: 1, cursor: "pointer", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5, borderRadius: 3 }}>
        👁 {current ? `${current.name} · ${current.roleName}` : "View as role"}
      </div>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50, background: C.s1, border: `1px solid ${C.br}`, borderRadius: 4, minWidth: 220, boxShadow: "0 8px 24px rgba(0,0,0,.4)", padding: 4 }}>
          <div style={{ fontSize: 8.5, fontFamily: M, color: C.t4, letterSpacing: 1, textTransform: "uppercase", padding: "5px 8px" }}>View the demo as…</div>
          {(state.users || []).map((u) => (
            <div key={u.email} onClick={() => pick(u.email)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", cursor: "pointer", borderRadius: 3, background: u.email === state.current ? C.s2 : "transparent" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = C.s2)} onMouseLeave={(e) => (e.currentTarget.style.background = u.email === state.current ? C.s2 : "transparent")}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: ROLE_COLORS[u.roleName] || C.t4, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: C.t1 }}>{u.name}</div>
                <div style={{ fontSize: 9, fontFamily: M, color: C.t3 }}>{u.roleName}</div>
              </div>
              {u.email === state.current && <span style={{ color: C.gn, fontSize: 11 }}>✓</span>}
            </div>
          ))}
          {state.current && (
            <div onClick={() => pick("")} style={{ padding: "6px 8px", cursor: "pointer", fontSize: 9.5, fontFamily: M, color: C.t3, borderTop: `1px solid ${C.br}`, marginTop: 2 }}>↺ Reset to default (admin)</div>
          )}
        </div>
      )}
    </div>
  );
}
