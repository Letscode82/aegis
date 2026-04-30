/**
 * /api/intake/storage — server-side replacement for the v8 demo's
 * `window.storage` localStorage shim. Routes to @aegis/intake/server,
 * which translates the v8 storage keys to Prisma queries.
 *
 * GET    ?key=<k>          → 200 { value: string } | 200 null
 * PUT    body { key, value } → 204
 * DELETE ?key=<k>          → 204
 *
 * Body cap is 256 KB (the tickets payload is the largest writer in
 * the demo and lands well under that). No auth in Step 2 — Step 3
 * adds the Auth0 session check via @aegis/auth.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import {
  intakeStorageGet,
  intakeStorageSet,
  intakeStorageDelete,
} from "@aegis/intake/server";

const BODY_LIMIT_BYTES = 256 * 1024;

function getKey(req: NextApiRequest): string | null {
  const k = req.query.key;
  if (typeof k !== "string" || !k) return null;
  return k;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method === "GET") {
      const key = getKey(req);
      if (!key) return res.status(400).json({ error: "Missing key" });
      const result = await intakeStorageGet(key);
      return res.status(200).json(result);
    }

    if (req.method === "PUT") {
      const contentLength = Number(req.headers["content-length"] || 0);
      if (contentLength > BODY_LIMIT_BYTES) {
        return res.status(413).json({ error: "Payload too large" });
      }
      const body = req.body as { key?: unknown; value?: unknown } | undefined;
      if (!body || typeof body.key !== "string") {
        return res.status(400).json({ error: "Missing key" });
      }
      if (typeof body.value !== "string") {
        return res
          .status(400)
          .json({ error: "value must be a JSON-stringified string" });
      }
      await intakeStorageSet(body.key, body.value);
      return res.status(204).end();
    }

    if (req.method === "DELETE") {
      const key = getKey(req);
      if (!key) return res.status(400).json({ error: "Missing key" });
      await intakeStorageDelete(key);
      return res.status(204).end();
    }

    res.setHeader("Allow", "GET,PUT,DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[/api/intake/storage] failed:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

// Increase the body parser limit for the tickets PUT.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "256kb",
    },
  },
};
