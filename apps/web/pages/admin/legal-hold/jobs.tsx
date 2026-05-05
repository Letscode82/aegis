import dynamic from "next/dynamic";
import Head from "next/head";

const JobsAdmin = dynamic(
  () => import("@aegis/matter/ui").then((m) => m.JobsAdmin),
  { ssr: false },
);

export default function AdminLegalHoldJobsPage() {
  return (
    <>
      <Head>
        <title>AEGIS · Legal Hold maintenance jobs</title>
      </Head>
      <main style={{ background: "#0B1020", minHeight: "100vh" }}>
        <JobsAdmin />
      </main>
    </>
  );
}
