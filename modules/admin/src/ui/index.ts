/**
 * @aegis/admin/ui — public UI surface.
 *
 * apps/web composes these components inside the Aurora shell. The
 * server-side gates on /api/admin/* enforce permissions; this module
 * only renders.
 */
export { AdminUsersView } from "./admin-users-view";
export { AdminRolesView } from "./admin-roles-view";
