/**
 * Deep link to a specific hold detail. Redirects into the Aurora
 * shell with the matter id; the Holds tab is exposed inside
 * matter-detail-view's tab list, so users land on the matter and
 * can drill in by clicking the hold. (Direct hold-detail rendering
 * via state seeding lands when matter-shell's hold sub-state grows
 * URL sync.)
 */
import type { GetServerSideProps } from "next";

export default function HoldDetailRedirect() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const id = typeof ctx.params?.id === "string" ? ctx.params.id : "";
  if (!id) {
    return { redirect: { destination: "/?view=matters", permanent: false } };
  }
  return {
    redirect: {
      destination: `/?view=matters&matterId=${encodeURIComponent(id)}`,
      permanent: false,
    },
  };
};
