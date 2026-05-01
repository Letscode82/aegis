/**
 * /matter — kept as a deep-link entry point for bookmarks.
 *
 * The actual UI lives inside the Aurora AppShell at "/" — this route
 * server-side redirects there so users land in the same one-app
 * experience regardless of how they arrived.
 */
import type { GetServerSideProps } from "next";

export default function MatterRedirect() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: "/?view=matters", permanent: false },
});
