import { NextResponse } from "next/server";

import { getUpcomingTicketSale } from "@/lib/events/public";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const serverNow = new Date();
  const event = await getUpcomingTicketSale(serverNow);
  const response = NextResponse.json(event ? {
    active: true,
    eventName: event.name,
    eventSlug: event.slug,
    salesStartAt: event.salesStartAt!.toISOString(),
    eventStartAt: event.startAt.toISOString(),
    venueName: event.venueName,
    coverImage: event.coverImage || event.bannerImage,
    serverNow: serverNow.toISOString(),
  } : {
    active: false,
    serverNow: serverNow.toISOString(),
  });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
