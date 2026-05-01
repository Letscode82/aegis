import type { GetServerSideProps } from "next";

export default function MatterListRedirect() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: "/?view=matters&matterAction=list", permanent: false },
});
