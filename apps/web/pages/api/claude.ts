import type { NextApiRequest, NextApiResponse } from "next";
import { handleClaudeRequest } from "@aegis/ai/proxy";

// Thin wrapper around the shared proxy implementation in @aegis/ai. Keeping
// the rate-limit, body-cap, and upstream-call logic in @aegis/ai means a
// future runtime swap (Edge runtime, Node, Cloudflare) only changes this
// thin wrapper, not the policy.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return handleClaudeRequest(req, res);
}
