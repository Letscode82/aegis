# @aegis/auth

Auth0 integration and the canonical permission model. **Empty in Step 1.**
Populated in Step 3 (PR #3).

## Step 3 will add
- `@auth0/nextjs-auth0` configuration: login/logout, callback, session.
- `useCurrentUser()` hook — `{ user, organization, role, permissions }`.
- Canonical `Permission` enum (e.g. `intake:approve_recommendation`,
  `matter:legal_hold:issue`, `spend:approve_invoice`, …).
- Role → Permission map for: `admin`, `gc`, `attorney`, `paralegal`,
  `legal_ops`, `requester`, `external_counsel`, `viewer`.
- `canUserDo(user, action, resource)` for resource-level checks.

## Architectural rule
Every gated UI affordance and API mutation calls `canUserDo()` (or its
equivalent). Modules do **not** define their own permission strings;
they pick from the canonical enumeration in `@aegis/auth`.
