/**
 * Auth0 catch-all — handles /api/auth/login, /api/auth/logout,
 * /api/auth/callback, /api/auth/me. The actual implementation is
 * factored into @aegis/auth/server so the dev-mode fallback (no
 * AUTH0_* env vars) can short-circuit cleanly.
 */
import { makeAuthHandler } from "@aegis/auth/server";

export default makeAuthHandler();
