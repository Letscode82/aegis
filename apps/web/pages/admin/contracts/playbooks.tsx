import dynamic from "next/dynamic";
import Head from "next/head";

const PlaybookEditor = dynamic(
  () => import("@aegis/contracts/ui").then((m) => m.PlaybookEditor),
  { ssr: false },
);

export default function AdminContractPlaybooksPage() {
  return (
    <>
      <Head>
        <title>OneLegal · Contract Playbooks</title>
      </Head>
      <main style={{ background: "#0B1020", minHeight: "100vh" }}>
        <PlaybookEditor />
      </main>
    </>
  );
}
