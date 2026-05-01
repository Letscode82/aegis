import type { GetServerSideProps } from "next";

export default function AdminRolesRedirect() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: "/?view=roles", permanent: false },
});
