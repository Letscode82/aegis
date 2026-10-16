/**
 * GET /api/addin/health — unauthenticated connectivity probe for the Word
 * add-in task pane (PR E). No Graph call, no DB — mirrors the _health routes.
 */
import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  return res.status(200).json({ ok: true, service: "onelegal-word-addin", version: 1 });
}
