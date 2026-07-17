/**
 * /contract-review/[token] — the login-less counterparty review portal
 * (CTR-3). No auth: the opaque token in the URL is the sole access grant,
 * validated + scoped server-side by /api/contract-review/[token]. The
 * page just extracts the token and mounts the review view (ssr:false,
 * same pattern as the custodian portal).
 */
import dynamic from "next/dynamic";
import Head from "next/head";
import { useRouter } from "next/router";

const CounterpartyReviewView = dynamic(
  () => import("@aegis/contracts/ui").then((m) => m.CounterpartyReviewView),
  { ssr: false },
);

export default function ContractReviewPage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : null;

  return (
    <>
      <Head>
        <title>Contract Review · AEGIS</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      {token ? <CounterpartyReviewView token={token} /> : null}
    </>
  );
}
