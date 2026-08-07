import { NextResponse } from "next/server";

import { EVENT_TICKET_PORTAL_COOKIE, portalCookieOptions } from "@/lib/events/portal-cookie";
import { exchangeEventTicketPortalMagicLink } from "@/lib/events/portal-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function responseHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let exchanged = null;
  try {
    exchanged = await exchangeEventTicketPortalMagicLink({
      rawMagicToken: token,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
    });
  } catch {
    exchanged = null;
  }
  const destination = new URL(exchanged ? "/meus-ingressos/painel" : "/meus-ingressos?acesso=indisponivel", request.url);
  const response = NextResponse.redirect(destination, { status: 303, headers: responseHeaders() });
  if (exchanged) {
    response.cookies.set(EVENT_TICKET_PORTAL_COOKIE, exchanged.rawSessionToken, portalCookieOptions(exchanged.expiresAt));
  }
  return response;
}
