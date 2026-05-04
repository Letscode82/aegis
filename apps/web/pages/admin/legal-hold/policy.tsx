import dynamic from "next/dynamic";
import Head from "next/head";

const HoldPolicyEditor = dynamic(
  () => import("@aegis/matter/ui").then((m) => m.HoldPolicyEditor),
  { ssr: false },
);

export default function AdminHoldPolicyPage() {
  return (
    <>
      <Head>
        <title>AEGIS · Legal Hold policy</title>
      </Head>
      <main style={{ background: "#0B1020", minHeight: "100vh" }}>
        <HoldPolicyEditor />
      </main>
    </>
  );
}
