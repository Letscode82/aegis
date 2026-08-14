/**
 * /dsar-portal — PUBLIC data-subject self-service intake (no auth). Members of
 * the public file a DSAR here; the module handles classification + tracking.
 */
import Head from "next/head";
import { DsarPortalIntake } from "@aegis/privacy/ui";

export default function DsarPortalIntakePage() {
  return (
    <>
      <Head>
        <title>Submit a data request · AEGIS</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <DsarPortalIntake />
    </>
  );
}
