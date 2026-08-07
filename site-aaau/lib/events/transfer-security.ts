import crypto from "node:crypto";

const TRANSFER_TOKEN_BYTES = 32;

export type EventTicketTransferHashPurpose =
  | "access-grant"
  | "current-holder-confirmation"
  | "recipient-acceptance"
  | "holder-email"
  | "qr-token"
  | "ticket-code";

function transferSecret() {
  const secret = process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("EVENT_TICKET_TRANSFER_TOKEN_SECRET precisa ter pelo menos 32 caracteres.");
  }
  return secret;
}

export function normalizeEventTicketHolderEmail(value: string) {
  return value.trim().normalize("NFKC").toLowerCase();
}

export function hashEventTicketTransferValue(
  purpose: EventTicketTransferHashPurpose,
  value: string,
) {
  return crypto
    .createHmac("sha256", transferSecret())
    .update(purpose)
    .update("\0")
    .update(value)
    .digest("hex");
}

export function hashEventTicketHolderEmail(value: string) {
  return hashEventTicketTransferValue("holder-email", normalizeEventTicketHolderEmail(value));
}

export function generateEventTicketTransferToken() {
  return crypto.randomBytes(TRANSFER_TOKEN_BYTES).toString("base64url");
}

export function hashEventTicketAccessToken(token: string) {
  return hashEventTicketTransferValue("access-grant", token.trim());
}

export function hashEventTicketQrToken(token: string) {
  return hashEventTicketTransferValue("qr-token", token.trim());
}

export function hashEventTicketCode(code: string) {
  return hashEventTicketTransferValue("ticket-code", code.trim().toUpperCase());
}
