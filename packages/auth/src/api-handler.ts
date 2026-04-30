/**
 * Auth0 catch-all handler factory.
 *
 * apps/web mounts this at `pages/api/auth/[...auth0].ts`. When Auth0 is
 * not configured (dev mode, missing env vars), the handler serves a
 * deterministic JSON response so the route still exists — anything that
 * follows a login link sees a 200 and a "disabled" payload, instead of
 * a build-time crash from the SDK initialising with an empty AUTH0_SECRET.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { isAuth0Configured } from "./server";

type AuthHandler = (req: NextApiRequest, res: NextApiResponse) => unknown;

/**
 * Returns a handler suitable for the `pages/api/auth/[...auth0].ts`
 * file. Lazy-imports @auth0/nextjs-auth0 only when configured.
 */
export function makeAuthHandler(): AuthHandler {
  return async (req, res) => {
    if (!isAuth0Configured()) {
      // Dev mode — describe the state instead of crashing.
      res.status(200).json({
        ok: false,
        mode: "dev-no-auth",
        message:
          "Auth0 is not configured. The demo runs as the seeded admin (Alex Nguyen). " +
          "Set AUTH0_SECRET, AUTH0_BASE_URL, AUTH0_ISSUER_BASE_URL, AUTH0_CLIENT_ID, and AUTH0_CLIENT_SECRET to enable the login flow.",
      });
      return;
    }
    const { handleAuth } = await import("@auth0/nextjs-auth0");
    return handleAuth()(req, res);
  };
}
