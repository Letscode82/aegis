import type { GetServerSideProps } from "next";

export default function AuditLogRedirect() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: "/?view=audit", permanent: false },
});
