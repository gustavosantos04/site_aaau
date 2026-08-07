import { cookies } from "next/headers";

import { resolveEventTicketPortalSession, revokeEventTicketPortalSession } from "@/lib/events/portal-session";
import { eventTicketPortalEnabled } from "@/lib/events/portal-config";

export const EVENT_TICKET_PORTAL_COOKIE = "aaau_ticket_portal_session";

export function portalCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/meus-ingressos",
    expires: expiresAt,
  };
}

export async function getPortalCookieToken() {
  return (await cookies()).get(EVENT_TICKET_PORTAL_COOKIE)?.value ?? null;
}

export async function getPortalSessionFromCookie(recordAccess = true) {
  if (!eventTicketPortalEnabled()) return null;
  const token = await getPortalCookieToken();
  if (!token) return null;
  const session = await resolveEventTicketPortalSession(token, new Date(), recordAccess);
  return session ? { ...session, rawSessionToken: token } : null;
}

export async function clearAndRevokePortalSession() {
  const store = await cookies();
  const token = store.get(EVENT_TICKET_PORTAL_COOKIE)?.value;
  if (token) await revokeEventTicketPortalSession(token);
  store.set(EVENT_TICKET_PORTAL_COOKIE, "", portalCookieOptions(new Date(0)));
}
