/**
 * /matter — Matter Management dashboard.
 *
 * Composition root for the Matter module's entry view. Wires the
 * dashboard component (which fetches its own data from
 * /api/matter/dashboard) and the top-level navigation.
 */
import dynamic from "next/dynamic";
import Head from "next/head";
import Link from "next/link";

const MatterDashboard = dynamic(
  () => import("@aegis/matter/ui").then((m) => m.MatterDashboard),
  { ssr: false },
);

export default function MatterDashboardPage() {
  return (
    <>
      <Head>
        <title>AEGIS · Matters</title>
      </Head>
      <main style={{ background: "#0B1020", minHeight: "100vh" }}>
        <Nav active="dashboard" />
        <MatterDashboard />
      </main>
    </>
  );
}

export function Nav({ active }: { active: string }) {
  const items: Array<{ key: string; label: string; href: string }> = [
    { key: "dashboard", label: "Dashboard", href: "/matter" },
    { key: "list", label: "All matters", href: "/matter/list" },
    { key: "new", label: "+ New matter", href: "/matter/new" },
    { key: "audit", label: "Audit log", href: "/audit-log" },
    { key: "intake", label: "Intake", href: "/" },
  ];
  return (
    <nav
      style={{
        display: "flex",
        gap: 4,
        padding: "10px 14px",
        borderBottom: "1px solid #2A3558",
        background: "#111831",
      }}
    >
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          style={{
            color: it.key === active ? "#F4EFE6" : "#8B93AE",
            fontFamily: "Inter,system-ui,sans-serif",
            fontSize: 11,
            fontWeight: it.key === active ? 700 : 500,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            padding: "5px 10px",
            borderRadius: 4,
            background: it.key === active ? "#1A2340" : "transparent",
            textDecoration: "none",
          }}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
