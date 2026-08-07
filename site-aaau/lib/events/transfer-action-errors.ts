const SAFE_TRANSFER_ERROR = /^EVENT_TICKET_[A-Z0-9_]+$/;

export function safeEventTicketTransferErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return SAFE_TRANSFER_ERROR.test(message) ? message : "EVENT_TICKET_TRANSFER_INTERNAL_ERROR";
}

export function eventTicketTransferErrorDestination(error: unknown, retryPath?: string) {
  const code = safeEventTicketTransferErrorCode(error);
  if (code === "EVENT_TICKET_TRANSFER_EXPIRED") return "/transferencia-ingresso/expirada";
  if (code === "EVENT_TICKET_TRANSFER_RECIPIENT_INVALID" && retryPath) {
    return `${retryPath}?erro=dados`;
  }
  return "/transferencia-ingresso/cancelada";
}
