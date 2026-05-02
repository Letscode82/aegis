import dynamic from "next/dynamic";
import Head from "next/head";

const AdminM365Status = dynamic(
  () => import("@aegis/matter/ui").then((m) => m.AdminM365Status),
  { ssr: false },
);

export default function AdminM365Page() {
  return (
    <>
      <Head>
        <title>AEGIS · M365 connection</title>
      </Head>
      <main style={{ background: "#0B1020", minHeight: "100vh" }}>
        <AdminM365Status />
      </main>
    </>
  );
}
