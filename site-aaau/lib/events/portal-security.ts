import crypto from "node:crypto";

import { hashEventTicketHolderEmail } from "@/lib/events/transfer-security";

const TOKEN_BYTES = 32;
const ENCRYPTION_PURPOSE = "event-ticket-portal-outbox-v1";

type PortalHashPurpose = "email" | "magic-link" | "session" | "rate-limit";

function portalSecret() {
  const secret = process.env.EVENT_TICKET_PORTAL_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("EVENT_TICKET_PORTAL_SECRET precisa ter pelo menos 32 caracteres.");
  }
  return secret;
}

export function normalizePortalEmail(value: string) {
  return value.trim().normalize("NFKC").toLowerCase();
}

export function generatePortalToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashPortalValue(purpose: PortalHashPurpose, value: string) {
  return crypto.createHmac("sha256", portalSecret()).update(purpose).update("\0").update(value).digest("hex");
}

// This is the authorization identity shared with grants and transfer history.
// Token, session, rate-limit and outbox purposes remain isolated by the portal secret.
export const hashPortalEmail = (email: string) => hashEventTicketHolderEmail(normalizePortalEmail(email));
export const hashPortalMagicLinkToken = (token: string) => hashPortalValue("magic-link", token.trim());
export const hashPortalSessionToken = (token: string) => hashPortalValue("session", token.trim());
export const hashPortalRateLimitKey = (key: string) => hashPortalValue("rate-limit", key);

function encryptionKey() {
  return crypto.createHash("sha256").update(ENCRYPTION_PURPOSE).update("\0").update(portalSecret()).digest();
}

export type PortalEmailPayload = { subject: string; text: string; html: string };

export function encryptPortalEmailPayload(payload: PortalEmailPayload) {
  const initializationVector = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), initializationVector);
  cipher.setAAD(Buffer.from(ENCRYPTION_PURPOSE));
  const encryptedPayload = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return {
    encryptedPayload: encryptedPayload.toString("base64"),
    initializationVector: initializationVector.toString("base64"),
    authenticationTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptPortalEmailPayload(input: {
  encryptedPayload: string;
  initializationVector: string;
  authenticationTag: string;
}) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(input.initializationVector, "base64"));
  decipher.setAAD(Buffer.from(ENCRYPTION_PURPOSE));
  decipher.setAuthTag(Buffer.from(input.authenticationTag, "base64"));
  const parsed: unknown = JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(input.encryptedPayload, "base64")), decipher.final(),
  ]).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || !("subject" in parsed) || !("text" in parsed) || !("html" in parsed) ||
    typeof parsed.subject !== "string" || typeof parsed.text !== "string" || typeof parsed.html !== "string") {
    throw new Error("EVENT_TICKET_PORTAL_OUTBOX_PAYLOAD_INVALID");
  }
  return parsed as PortalEmailPayload;
}
