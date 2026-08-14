/**
 * /dsar-portal/[token] — PUBLIC login-less status/delivery tracker for a data
 * subject. The token IS the gate (resolved server-side by the API).
 */
import Head from "next/head";
import { useRouter } from "next/router";
import { DsarPortalStatus } from "@aegis/privacy/ui";

export default function DsarPortalStatusPage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : "";
  return (
    <>
      <Head>
        <title>Your data request · AEGIS</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      {token ? <DsarPortalStatus token={token} /> : null}
    </>
  );
}
