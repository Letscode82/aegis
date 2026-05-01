import type { GetServerSideProps } from "next";

export default function MatterNewRedirect() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const ticket =
    typeof ctx.query.intakeTicketId === "string"
      ? `&intakeTicketId=${encodeURIComponent(ctx.query.intakeTicketId)}`
      : "";
  return {
    redirect: {
      destination: `/?view=matters&matterAction=new${ticket}`,
      permanent: false,
    },
  };
};
