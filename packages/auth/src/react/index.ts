/**
 * @aegis/auth/react — React-only entry point.
 *
 * Client components import from here. Pulls in only browser-safe
 * code paths; nothing here imports Auth0 SDK or @aegis/db. The
 * server endpoints (apps/web/pages/api/auth/current-user.ts) do
 * the heavy lifting; hooks here just shape the response.
 */

export {
  useCurrentUser,
  type CurrentUserState,
} from "./use-current-user";
