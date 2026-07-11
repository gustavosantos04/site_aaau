import { getConfiguredBaseUrl } from "@/lib/site-url";

const QR_TOKEN_RE = /^tk_[A-Za-z0-9_-]{12,}$/;

export function isEventTicketQrToken(value: string) {
  return QR_TOKEN_RE.test(value.trim());
}

export function parseEventTicketQrPayload(payload: string, baseUrl = getConfiguredBaseUrl({ allowLocalhost: true })) {
  const raw = payload.trim();

  if (QR_TOKEN_RE.test(raw)) {
    return { ok: true as const, qrToken: raw };
  }

  if (!raw || raw.startsWith("javascript:") || raw.startsWith("data:") || raw.startsWith("file:")) {
    return { ok: false as const, reason: "INVALID_FORMAT" };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false as const, reason: "INVALID_URL" };
  }

  const expectedOrigin = new URL(baseUrl).origin;
  if (parsed.origin !== expectedOrigin) {
    return { ok: false as const, reason: "WRONG_ORIGIN" };
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || parts[0] !== "checkin") {
    return { ok: false as const, reason: "WRONG_PATH" };
  }

  const qrToken = decodeURIComponent(parts[1] ?? "");
  if (!QR_TOKEN_RE.test(qrToken)) {
    return { ok: false as const, reason: "INVALID_TOKEN" };
  }

  return { ok: true as const, qrToken };
}
