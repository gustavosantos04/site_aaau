export type EventTicketTransferBrowserPurpose = "accept" | "confirm";

const CONFIG = {
  accept: {
    cookieName: "aaau_event_ticket_transfer_accept",
    maxAge: 48 * 60 * 60,
    path: "/transferencia-ingresso/aceitar",
  },
  confirm: {
    cookieName: "aaau_event_ticket_transfer_confirm",
    maxAge: 30 * 60,
    path: "/transferencia-ingresso/confirmar",
  },
} as const;

export function getEventTicketTransferBrowserConfig(purpose: EventTicketTransferBrowserPurpose) {
  return CONFIG[purpose];
}

export function isValidEventTicketTransferBrowserToken(token: string) {
  return /^[A-Za-z0-9_-]{32,256}$/.test(token);
}

export function eventTicketTransferCookieOptions(purpose: EventTicketTransferBrowserPurpose) {
  const config = getEventTicketTransferBrowserConfig(purpose);
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: config.path,
    maxAge: config.maxAge,
  };
}
