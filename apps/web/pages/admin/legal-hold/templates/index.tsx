import dynamic from "next/dynamic";
import Head from "next/head";

const HoldScopeTemplatesAdmin = dynamic(
  () => import("@aegis/matter/ui").then((m) => m.HoldScopeTemplatesAdmin),
  { ssr: false },
);

export default function AdminHoldTemplatesPage() {
  return (
    <>
      <Head>
        <title>OneLegal · Legal Hold scope templates</title>
      </Head>
      <main style={{ background: "#0B1020", minHeight: "100vh" }}>
        <HoldScopeTemplatesAdmin />
      </main>
    </>
  );
}
