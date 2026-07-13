export function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function getConfiguredBaseUrl(options: { allowLocalhost?: boolean; nodeEnv?: string } = {}) {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const raw =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.VERCEL_URL?.trim() ? `https://${process.env.VERCEL_URL.trim()}` : "");

  const fallback = nodeEnv === "production" ? "" : "http://localhost:3000";
  const baseUrl = normalizeBaseUrl(raw || fallback);

  if (!baseUrl) {
    throw new Error("APP_URL precisa estar configurada em producao.");
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("APP_URL precisa ser uma URL absoluta valida.");
  }

  const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (nodeEnv === "production" && isLocalhost && !options.allowLocalhost) {
    throw new Error("APP_URL de producao nao pode apontar para localhost.");
  }

  return baseUrl;
}

export function buildAbsoluteUrl(path: string, options: { allowLocalhost?: boolean; nodeEnv?: string } = {}) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getConfiguredBaseUrl(options)}${normalizedPath}`;
}

export function buildMercadoPagoNotificationUrl(
  baseUrl = getConfiguredBaseUrl(),
  path = "/api/mercado-pago/webhook",
) {
  const url = new URL(path, `${normalizeBaseUrl(baseUrl)}/`);
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();

  if (process.env.VERCEL_ENV === "preview" && bypassSecret) {
    url.searchParams.set("x-vercel-protection-bypass", bypassSecret);
  }

  return url.toString();
}
