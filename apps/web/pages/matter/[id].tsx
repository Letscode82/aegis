import type { GetServerSideProps } from "next";

export default function MatterDetailRedirect() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const id = typeof ctx.params?.id === "string" ? ctx.params.id : "";
  if (!id) {
    return {
      redirect: { destination: "/?view=matters", permanent: false },
    };
  }
  return {
    redirect: {
      destination: `/?view=matters&matterId=${encodeURIComponent(id)}`,
      permanent: false,
    },
  };
};
