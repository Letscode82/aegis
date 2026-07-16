import { useState, useEffect, useRef } from "react";
import { C, M } from "@aegis/ui";
import { useCurrentUser, setPreviewRole } from "@aegis/auth/react";

// Admin-only "Preview as role" — Auth0-safe (works on the live
// deployment, unlike the dev-mode cookie switcher). Changes only what the
// UI renders (nav, gated affordances) by swapping the previewed role's
// permission set client-side; every mutation still runs as the real
// admin and is audited. See @aegis/auth/react/preview-role.

const PREVIEW_ROLES = [
  "gc",
  "attorney",
  "paralegal",
  "legal_ops",
  "requester",
  "external_counsel",
  "viewer",
];

const ROLE_LABEL = {
  gc: "General Counsel",
  attorney: "Attorney",
  paralegal: "Paralegal",
  legal_ops: "Legal Ops",
  requester: "Requester",
  external_counsel: "External Counsel",
  viewer: "Viewer",
};

export function PreviewRoleSwitcher() {
  const { roleName, previewRole } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Visible to admins only. When a preview is active roleName is the
  // previewed (non-admin) role, but previewRole !== null still gates it in
  // — preview only ever activates for a real admin.
  const canPreview = roleName === "admin" || previewRole !== null;
  if (!canPreview) return null;

  const active = previewRole !== null;
  const color = active ? C.am : C.t3;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        onClick={() => setOpen((o) => !o)}
        title="Preview the app as another role (read-only — your actions still run as you)"
        style={{ padding: "5px 10px", border: `1px solid ${active ? C.am : C.br}`, background: active ? C.am + "18" : "transparent", color, fontSize: 9, fontFamily: M, letterSpacing: 1, cursor: "pointer", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6, borderRadius: 3 }}
      >
        👁 {active ? `Preview: ${ROLE_LABEL[previewRole] || previewRole}` : "Preview as role"}
      </div>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: C.s1, border: `1px solid ${C.br}`, borderRadius: 5, padding: 6, minWidth: 190, zIndex: 200, boxShadow: "0 8px 30px rgba(0,0,0,.45)" }}>
          <div style={{ fontSize: 8.5, fontFamily: M, color: C.t4, letterSpacing: 1.2, textTransform: "uppercase", padding: "4px 8px 6px" }}>Preview read-only as…</div>
          {PREVIEW_ROLES.map((r) => (
            <div key={r} onClick={() => { setPreviewRole(r); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "7px 8px", borderRadius: 3, cursor: "pointer", background: previewRole === r ? C.am + "18" : "transparent" }}
              onMouseEnter={(e) => { if (previewRole !== r) e.currentTarget.style.background = C.cd; }}
              onMouseLeave={(e) => { if (previewRole !== r) e.currentTarget.style.background = "transparent"; }}>
              <span style={{ fontSize: 11, color: previewRole === r ? C.am : C.t2 }}>{ROLE_LABEL[r]}</span>
              <span style={{ fontSize: 8.5, fontFamily: M, color: C.t4 }}>{r}</span>
            </div>
          ))}
          {active && (
            <div onClick={() => { setPreviewRole(null); setOpen(false); }}
              style={{ marginTop: 4, padding: "7px 8px", borderTop: `1px solid ${C.br}`, cursor: "pointer", fontSize: 10, fontFamily: M, color: C.cy, letterSpacing: .5, textTransform: "uppercase", textAlign: "center" }}>
              ✕ Exit preview · back to Admin
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Sticky banner shown app-wide while a preview is active.
export function PreviewRoleBanner() {
  const { previewRole } = useCurrentUser();
  if (!previewRole) return null;
  return (
    <div style={{ padding: "6px 20px", background: C.am + "1f", borderBottom: `1px solid ${C.am}55`, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 10.5, fontFamily: M, color: C.am, letterSpacing: .5 }}>
      <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>👁 Previewing as {ROLE_LABEL[previewRole] || previewRole}</span>
      <span style={{ color: C.t2 }}>read-only — you still see the whole platform as an admin; any action runs as you and is audited.</span>
      <span onClick={() => setPreviewRole(null)} style={{ cursor: "pointer", color: C.cy, textDecoration: "underline" }}>exit</span>
    </div>
  );
}
