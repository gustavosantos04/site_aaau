export type MercadoPagoPaymentRoute =
  | { kind: "event"; eventOrderId: string }
  | { kind: "store"; orderId: string }
  | { kind: "legacy-store"; orderId: string }
  | { kind: "unknown" };

export function routeMercadoPagoExternalReference(
  externalReference?: string | null,
): MercadoPagoPaymentRoute {
  const value = externalReference?.trim();

  if (!value) {
    return { kind: "unknown" };
  }

  if (value.startsWith("event_order:")) {
    const eventOrderId = value.slice("event_order:".length).trim();
    return eventOrderId ? { kind: "event", eventOrderId } : { kind: "unknown" };
  }

  if (value.startsWith("store_order:")) {
    const orderId = value.slice("store_order:".length).trim();
    return orderId ? { kind: "store", orderId } : { kind: "unknown" };
  }

  return { kind: "legacy-store", orderId: value };
}
