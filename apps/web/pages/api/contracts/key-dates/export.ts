/**
 * GET /api/contracts/key-dates/export — download the key dates as an
 * iCalendar (.ics) file: contract expiries, renewal-notice deadlines, and open
 * obligation due dates, each with a 7-day-prior reminder. Import/subscribe in
 * Outlook or Google Calendar. Read-only; contracts:read_all.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getKeyDates, buildKeyDatesICS } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    assertUserCanDo(user, Permission.ContractsReadAll);
    const { keyDates } = await getKeyDates(user.organizationId);
    const ics = buildKeyDatesICS(keyDates, { now: new Date(), calendarName: "AEGIS Contract Key Dates" });
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="aegis-contract-key-dates.ics"');
    return res.status(200).send(ics);
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
