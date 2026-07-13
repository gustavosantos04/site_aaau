import { NextResponse } from "next/server";

import { forbiddenJson, getPortariaApiActor, unauthorizedJson } from "@/app/api/portaria/_utils";
import { confirmPortariaQrTicket, parseEventTicketQrPayload, PortariaAuthError } from "@/lib/portaria";

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const actor = await getPortariaApiActor();
  if (!actor) return unauthorizedJson();
  const { eventId } = await params;
  const body = await request.json().catch(() => ({}));
  const rawQrToken = typeof body.qrToken === "string" ? body.qrToken : "";
  const rawPayload = typeof body.qrPayload === "string" ? body.qrPayload : "";
  const parsed = rawQrToken ? { ok: true as const, qrToken: rawQrToken } : parseEventTicketQrPayload(rawPayload);

  if (!parsed.ok) {
    return NextResponse.json({ status: "INVALID", ticket: null });
  }

  try {
    return NextResponse.json(await confirmPortariaQrTicket(actor, eventId, parsed.qrToken));
  } catch (error) {
    if (error instanceof PortariaAuthError) return forbiddenJson();
    throw error;
  }
}
