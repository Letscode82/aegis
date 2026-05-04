import dynamic from "next/dynamic";
import Head from "next/head";

const CustodianPortalHome = dynamic(
  () => import("@aegis/matter/ui").then((m) => m.CustodianPortalHome),
  { ssr: false },
);

export default function CustodianHoldsHome() {
  return (
    <>
      <Head>
        <title>AEGIS · Your legal holds</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main style={{ background: "#0B1020", minHeight: "100vh" }}>
        <CustodianPortalHome />
      </main>
    </>
  );
}
