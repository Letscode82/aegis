/**
 * /api/auth/current-user — returns { user: AuthUser | null }.
 *
 * Used by the React `useCurrentUser` hook. Resolves the user via
 * @aegis/auth/server, which honours both real Auth0 sessions and the
 * dev-mode fallback (Alex Nguyen) so the demo works either way.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getResolvedUser } from "@aegis/auth/server";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const user = await getResolvedUser(req, res);
    res.status(200).json({ user });
  } catch (err) {
    console.error("[/api/auth/current-user] failed:", err);
    res.status(500).json({ user: null, error: "Internal error" });
  }
}
