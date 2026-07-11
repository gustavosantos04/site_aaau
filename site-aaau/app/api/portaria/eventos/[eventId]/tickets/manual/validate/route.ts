import { NextResponse } from "next/server";

import { forbiddenJson, getPortariaApiActor, unauthorizedJson } from "@/app/api/portaria/_utils";
import { PortariaAuthError, validatePortariaManualTicket } from "@/lib/portaria";

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const actor = await getPortariaApiActor();
  if (!actor) return unauthorizedJson();
  const { eventId } = await params;
  const body = await request.json().catch(() => ({}));
  const ticketCode = typeof body.ticketCode === "string" ? body.ticketCode : "";

  try {
    return NextResponse.json(await validatePortariaManualTicket(actor, eventId, ticketCode));
  } catch (error) {
    if (error instanceof PortariaAuthError) return forbiddenJson();
    throw error;
  }
}
