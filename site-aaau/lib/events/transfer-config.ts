import { validateEventTicketOperationalConfig } from "@/lib/events/operational-config";

export function eventTicketTransfersEnabled() {
  return process.env.EVENT_TICKET_TRANSFERS_ENABLED?.trim().toLowerCase() === "true";
}

export function assertEventTicketTransfersEnabled() {
  validateEventTicketOperationalConfig({ requireTransfers: true });
}
