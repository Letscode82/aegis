/**
 * /sign/[token] — the login-less native e-signature page (CTR-15). No auth: the
 * opaque token is the sole access grant, validated + scoped server-side by
 * /api/contract-sign/[token]. Mounts the signing view (ssr:false).
 */
import dynamic from "next/dynamic";
import Head from "next/head";
import { useRouter } from "next/router";

const SigningView = dynamic(
  () => import("@aegis/contracts/ui").then((m) => m.SigningView),
  { ssr: false },
);

export default function ContractSignPage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : null;

  return (
    <>
      <Head>
        <title>Sign Contract · AEGIS</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      {token ? <SigningView token={token} /> : null}
    </>
  );
}
