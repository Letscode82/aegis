import type { GetServerSideProps } from "next";

/**
 * Legacy redirect. Sub-PR 4c.5 placed the notice-template editor at
 * /admin/legal-hold/templates/[id]/edit, but that namespace also hosts
 * the unrelated hold-scope-template surface. Sub-PR 4c.1 moved the
 * editor to /admin/legal-hold/notice-templates/[id]/edit so the two
 * paths don't fight over the same id. This stub keeps any existing
 * in-flight bookmarks working.
 */
export default function LegacyEditRedirect() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const id = ctx.params?.id;
  if (typeof id !== "string") {
    return {
      redirect: {
        destination: "/admin/legal-hold/notice-templates",
        permanent: false,
      },
    };
  }
  return {
    redirect: {
      destination: `/admin/legal-hold/notice-templates/${id}/edit`,
      permanent: false,
    },
  };
};
