import { getConfiguredBaseUrl } from "@/lib/site-url";
import { hashEventTicketTransferValue } from "@/lib/events/transfer-security";

const buckets = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60_000;
const LIMIT = 10;

export function assertEventTicketTransferCsrf(headers: Pick<Headers, "get">) {
  const origin = headers.get("origin");
  if (!origin) {
    if (process.env.NODE_ENV === "production") throw new Error("EVENT_TICKET_TRANSFER_CSRF");
    return;
  }
  if (new URL(origin).origin !== new URL(getConfiguredBaseUrl()).origin) {
    throw new Error("EVENT_TICKET_TRANSFER_CSRF");
  }
}

export function assertEventTicketTransferRateLimit(input: {
  action: string;
  opaqueCredential: string;
  ip?: string | null;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const key = `${input.action}:${hashEventTicketTransferValue("access-grant", input.opaqueCredential)}:${input.ip ?? "unknown"}`;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  if (current.count >= LIMIT) throw new Error("EVENT_TICKET_TRANSFER_RATE_LIMITED");
  current.count += 1;
}

export function resetEventTicketTransferRateLimitForTests() {
  if (process.env.NODE_ENV !== "test") throw new Error("EVENT_TICKET_TRANSFER_TEST_HELPER_FORBIDDEN");
  buckets.clear();
}
