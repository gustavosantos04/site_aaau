type OperationFields = {
  transferId?: string;
  portalSessionId?: string;
  deliveryId?: string;
  processed?: number;
  sent?: number;
  failed?: number;
  exhausted?: number;
  pending?: number;
  expired?: number;
  reason?: "invalid" | "expired" | "rate_limited" | "busy" | "disabled";
};

export function logEventTicketOperation(event: string, fields: OperationFields = {}) {
  console.info(JSON.stringify({ scope: "event-tickets", event, ...fields }));
}
