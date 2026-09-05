import dynamic from "next/dynamic";
import Head from "next/head";

const PipelinePlanPanel = dynamic(
  () => import("@aegis/matter/ui").then((m) => m.PipelinePlanPanel),
  { ssr: false },
);

export default function AdminPipelinePage() {
  return (
    <>
      <Head>
        <title>AEGIS · Pipeline plan</title>
      </Head>
      <main style={{ background: "#0B1020", minHeight: "100vh" }}>
        <PipelinePlanPanel />
      </main>
    </>
  );
}
