import dynamic from "next/dynamic";
import Head from "next/head";
import { Nav } from "./matter/index";

const AuditLogView = dynamic(
  () => import("@aegis/matter/ui").then((m) => m.AuditLogView),
  { ssr: false },
);

export default function AuditLogPage() {
  return (
    <>
      <Head>
        <title>AEGIS · Audit log</title>
      </Head>
      <main style={{ background: "#0B1020", minHeight: "100vh" }}>
        <Nav active="audit" />
        <AuditLogView />
      </main>
    </>
  );
}
