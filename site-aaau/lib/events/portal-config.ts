export function eventTicketPortalEnabled() {
  return process.env.EVENT_TICKET_PORTAL_ENABLED?.trim().toLowerCase() === "true";
}

export function assertEventTicketPortalEnabled() {
  validateEventTicketOperationalConfig({ requirePortal: true });
}
import { validateEventTicketOperationalConfig } from "@/lib/events/operational-config";
