import crypto from "node:crypto";

export type MercadoPagoSignatureValidation =
  | { valid: true }
  | {
      valid: false;
      reason: "MISSING_SECRET" | "MISSING_SIGNATURE" | "MALFORMED_SIGNATURE" | "SIGNATURE_MISMATCH";
    };

export function parseMercadoPagoSignature(value: string | null) {
  if (!value) return null;

  const parsed = new Map<string, string>();
  for (const part of value.split(",")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const partValue = part.slice(separator + 1).trim();
    if (key && partValue) parsed.set(key, partValue);
  }

  const ts = parsed.get("ts");
  const v1 = parsed.get("v1");
  return ts && v1 ? { ts, v1 } : null;
}

export function mercadoPagoSignedDataId(url: URL) {
  const dataId = url.searchParams.get("data.id");
  return dataId ? dataId.toLowerCase() : null;
}

export function buildMercadoPagoSignatureManifest(input: {
  dataId?: string | null;
  requestId?: string | null;
  ts?: string | null;
}) {
  return [
    input.dataId ? `id:${input.dataId.toLowerCase()};` : "",
    input.requestId ? `request-id:${input.requestId};` : "",
    input.ts ? `ts:${input.ts};` : "",
  ].join("");
}

function timingSafeEqualHex(left: string, right: string) {
  if (!/^[a-f\d]{64}$/i.test(left) || !/^[a-f\d]{64}$/i.test(right)) return false;
  return crypto.timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function validateMercadoPagoWebhookSignature(
  request: Request,
  secretValue = process.env.MERCADO_PAGO_WEBHOOK_SECRET,
): MercadoPagoSignatureValidation {
  const secret = secretValue?.trim();
  if (!secret) return { valid: false, reason: "MISSING_SECRET" };

  const signatureHeader = request.headers.get("x-signature");
  if (!signatureHeader) return { valid: false, reason: "MISSING_SIGNATURE" };

  const signature = parseMercadoPagoSignature(signatureHeader);
  if (!signature || !/^[a-f\d]{64}$/i.test(signature.v1)) {
    return { valid: false, reason: "MALFORMED_SIGNATURE" };
  }

  const url = new URL(request.url);
  const manifest = buildMercadoPagoSignatureManifest({
    dataId: mercadoPagoSignedDataId(url),
    requestId: request.headers.get("x-request-id"),
    ts: signature.ts,
  });
  const expected = crypto.createHmac("sha256", secret).update(manifest, "utf8").digest("hex");

  return timingSafeEqualHex(expected, signature.v1)
    ? { valid: true }
    : { valid: false, reason: "SIGNATURE_MISMATCH" };
}
