import crypto from "node:crypto";

const TRANSFER_TOKEN_BYTES = 32;

export type EventTicketTransferHashPurpose =
  | "access-grant"
  | "current-holder-confirmation"
  | "recipient-acceptance"
  | "direct-request"
  | "holder-email"
  | "qr-token"
  | "ticket-code";

function assertTransferSecret(value: string | undefined) {
  const secret = value?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("EVENT_TICKET_TRANSFER_TOKEN_SECRET precisa ter pelo menos 32 caracteres.");
  }
  return secret;
}

function transferSecret() {
  return assertTransferSecret(process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET);
}

export function eventTicketTransferSecretFingerprint(secret: string) {
  return crypto
    .createHash("sha256")
    .update("aaau:event-ticket-transfer-secret-fingerprint:v1\0")
    .update(assertTransferSecret(secret))
    .digest("hex")
    .slice(0, 16);
}

export function normalizeEventTicketHolderEmail(value: string) {
  return value.trim().normalize("NFKC").toLowerCase();
}

export function hashEventTicketTransferValue(
  purpose: EventTicketTransferHashPurpose,
  value: string,
) {
  return hashEventTicketTransferValueWithSecret(purpose, value, transferSecret());
}

export function hashEventTicketTransferValueWithSecret(
  purpose: EventTicketTransferHashPurpose,
  value: string,
  secret: string,
) {
  return crypto
    .createHmac("sha256", assertTransferSecret(secret))
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

export function hashEventTicketQrTokenWithSecret(token: string, secret: string) {
  return hashEventTicketTransferValueWithSecret("qr-token", token.trim(), secret);
}

export function hashEventTicketCodeWithSecret(code: string, secret: string) {
  return hashEventTicketTransferValueWithSecret("ticket-code", code.trim().toUpperCase(), secret);
}
