import dynamic from "next/dynamic";
import Head from "next/head";

const RoutingRulesAdmin = dynamic(
  () => import("@aegis/contracts/ui").then((m) => m.RoutingRulesAdmin),
  { ssr: false },
);

export default function AdminContractRoutingRulesPage() {
  return (
    <>
      <Head>
        <title>OneLegal · Contract Approval Routing</title>
      </Head>
      <main style={{ background: "#0B1020", minHeight: "100vh" }}>
        <RoutingRulesAdmin />
      </main>
    </>
  );
}
