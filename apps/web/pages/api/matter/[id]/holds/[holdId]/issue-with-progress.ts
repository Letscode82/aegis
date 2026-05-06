/**
 * POST /api/matter/[id]/holds/[holdId]/issue-with-progress
 *
 * Server-Sent Events stream that drives the wizard's ProgressPanel.
 * The endpoint runs the existing issue-hold + per-source apply +
 * notice flows via `issueHoldWithProgress`, piping each yielded
 * event into the SSE stream as a JSON-encoded `data:` payload.
 *
 * If the SSE connection drops (Vercel Lambda timeout, browser
 * backgrounding, network blip), the wizard falls back to
 * `GET /issue-status` for a snapshot view of the current state.
 *
 * Permission: matter:legal_hold:issue (same gate as the existing
 * one-shot `/issue` endpoint).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  IllegalHoldTransitionError,
  issueHoldWithProgressGen,
  type IssueProgressEvent,
} from "@aegis/matter";
import { requireActor } from "../../../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      ok: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
    });
  }
  const holdId = req.query.holdId;
  if (typeof holdId !== "string") {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_HOLD_ID", message: "Invalid holdId" },
    });
  }
  const actor = await requireActor(req, res, Permission.MatterLegalHoldIssue);
  if (!actor) return;

  const body = (req.body ?? {}) as {
    noticeTemplateId?: string;
    recipientCustodianPersonIds?: string[];
    pushToMicrosoft?: boolean;
    reasonCode?: string;
  };
  if (
    !body.noticeTemplateId ||
    !Array.isArray(body.recipientCustodianPersonIds) ||
    body.recipientCustodianPersonIds.length === 0
  ) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "INVALID_BODY",
        message:
          "noticeTemplateId + recipientCustodianPersonIds (non-empty) required",
      },
    });
  }

  // Open the SSE stream. Headers must be set before any write.
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Disable Vercel buffering — we want frames to flush as they're
  // yielded, not collected into one big response.
  res.setHeader("X-Accel-Buffering", "no");
  // Force the response to flush headers immediately so the client
  // EventSource transitions out of CONNECTING.
  res.flushHeaders?.();

  function send(event: IssueProgressEvent): void {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  try {
    const generator = await issueHoldWithProgressGen(
      {
        holdId,
        noticeTemplateId: body.noticeTemplateId,
        recipientCustodianPersonIds: body.recipientCustodianPersonIds,
        pushToMicrosoft: body.pushToMicrosoft ?? true,
        reasonCode: body.reasonCode,
      },
      actor,
    );
    for await (const ev of generator) {
      send(ev);
    }
  } catch (err) {
    const e = err as { name?: string; message?: string };
    const code =
      err instanceof IllegalHoldTransitionError
        ? "ILLEGAL_TRANSITION"
        : (e.name ?? "ISSUE_FLOW_FAILED");
    send({
      type: "error",
      error: { code, message: e.message ?? String(err) },
    });
  } finally {
    res.end();
  }
}
