import crypto from "node:crypto";

import { runEventTicketOutboxCycle } from "@/lib/events/outbox-operations";

function authorized(request: Request) {
  const configured = process.env.CRON_SECRET?.trim();
  if (!configured || configured.length < 32) return false;
  const supplied = request.headers.get("authorization") ?? "";
  const expectedDigest = crypto.createHash("sha256").update(`Bearer ${configured}`).digest();
  const suppliedDigest = crypto.createHash("sha256").update(supplied).digest();
  return crypto.timingSafeEqual(expectedDigest, suppliedDigest);
}

export async function handleEventTicketOutboxCron(request: Request) {
  if (!authorized(request)) {
    return Response.json({ ok: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await runEventTicketOutboxCycle({ limit: 20 });
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
