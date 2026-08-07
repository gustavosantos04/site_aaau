import { NextResponse } from "next/server";

import {
  eventTicketTransferCookieOptions,
  getEventTicketTransferBrowserConfig,
  isValidEventTicketTransferBrowserToken,
  type EventTicketTransferBrowserPurpose,
} from "@/lib/events/transfer-browser-session";

export function exchangeEventTicketTransferUrlToken(
  request: Request,
  rawToken: string,
  purpose: EventTicketTransferBrowserPurpose,
) {
  const config = getEventTicketTransferBrowserConfig(purpose);
  const destination = isValidEventTicketTransferBrowserToken(rawToken)
    ? config.path
    : "/transferencia-ingresso/cancelada";
  const response = NextResponse.redirect(new URL(destination, request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  if (destination === config.path) {
    response.cookies.set(config.cookieName, rawToken, eventTicketTransferCookieOptions(purpose));
  }
  return response;
}
