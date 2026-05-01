/**
 * apps/web — server-side helper to resolve the matter actor for an
 * API route + enforce a Permission gate.
 *
 * The pattern: handlers call `requireActor(req, res, Permission.X)`.
 * On success they get a MatterActor; on access denial / no-session
 * the helper writes the response and returns null so the handler can
 * `return` early without further action.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import {
  AccessDeniedError,
  Permission,
  assertUserCanDo,
  type ResourceContext,
} from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import type { MatterActor } from "@aegis/matter";

export async function requireActor(
  req: NextApiRequest,
  res: NextApiResponse,
  permission?: Permission,
  resource?: ResourceContext,
): Promise<MatterActor | null> {
  const user = await getResolvedUser(req, res);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  if (permission) {
    try {
      assertUserCanDo(user, permission, resource);
    } catch (err) {
      if (err instanceof AccessDeniedError) {
        res.status(403).json({ error: err.decision.message });
        return null;
      }
      throw err;
    }
  }
  return {
    id: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
  };
}

/** Either the requested permission OR a fallback. Returns the first that grants. */
export async function requireActorAny(
  req: NextApiRequest,
  res: NextApiResponse,
  permissions: Permission[],
): Promise<MatterActor | null> {
  const user = await getResolvedUser(req, res);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  for (const perm of permissions) {
    try {
      assertUserCanDo(user, perm);
      return {
        id: user.id,
        organizationId: user.organizationId,
        email: user.email,
        name: user.name,
      };
    } catch (err) {
      if (!(err instanceof AccessDeniedError)) throw err;
    }
  }
  res
    .status(403)
    .json({ error: `Requires one of: ${permissions.join(", ")}` });
  return null;
}
