import { NextResponse } from "next/server";

import { forbiddenJson, getPortariaApiActor, unauthorizedJson } from "@/app/api/portaria/_utils";
import { PortariaAuthError, searchPortariaTickets } from "@/lib/portaria";

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const actor = await getPortariaApiActor();
  if (!actor) return unauthorizedJson();
  const { eventId } = await params;
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";

  try {
    return NextResponse.json({ results: await searchPortariaTickets(actor, eventId, query) });
  } catch (error) {
    if (error instanceof PortariaAuthError) return forbiddenJson();
    throw error;
  }
}
