/**
 * Admin views — Aurora shell wrappers.
 *
 * Same eyebrow + serif title pattern as matter-shell.jsx. The
 * underlying primitives (AdminUsersView, AdminRolesView) live in
 * @aegis/admin/ui and own their own data fetching against
 * /api/admin/*; here we just frame them in the Aurora layout.
 */
import { C, F, M, SR } from "@aegis/ui";
import { AdminUsersView, AdminRolesView } from "@aegis/admin/ui";

const Eyebrow = ({ kicker, title, em, sub }) => (
  <div style={{ marginBottom: 16 }}>
    <div
      style={{
        fontSize: 10,
        fontFamily: M,
        letterSpacing: 2,
        color: C.em,
        textTransform: "uppercase",
        marginBottom: 4,
      }}
    >
      {kicker}
    </div>
    <div
      style={{
        fontSize: 24,
        fontFamily: SR,
        color: C.t1,
        fontWeight: 400,
        lineHeight: 1.2,
      }}
    >
      {title}{" "}
      <em style={{ color: C.em, fontStyle: "italic" }}>{em}</em>
    </div>
    <div style={{ fontSize: 11, color: C.t3, marginTop: 4, fontFamily: M }}>
      {sub}
    </div>
  </div>
);

export function AdminUsersShell() {
  return (
    <div style={{ fontFamily: F, color: C.t1 }}>
      <Eyebrow
        kicker="ADMIN · USER · MANAGEMENT"
        title="Provision and govern"
        em="every user in this organization"
        sub="Role grants and suspensions write a chained audit row · Auth0 identity provisioning sits alongside"
      />
      <div style={{ margin: "0 -18px -18px" }}>
        <AdminUsersView />
      </div>
    </div>
  );
}

export function AdminRolesShell() {
  return (
    <div style={{ fontFamily: F, color: C.t1 }}>
      <Eyebrow
        kicker="ADMIN · ROLE · CATALOG"
        title="Eight canonical roles —"
        em="permission grants are audit-chained"
        sub="Toggle a permission off and the chain captures before/after · admin role enforces the superuser bundle invariant"
      />
      <div style={{ margin: "0 -18px -18px" }}>
        <AdminRolesView />
      </div>
    </div>
  );
}
