export const APP_VERSION_RECHECK_MS = 5 * 60 * 1000;

const sensitivePathPrefixes = [
  "/checkout",
  "/eventos/pagamento",
  "/pagamento",
  "/meus-ingressos",
  "/transferencia-ingresso",
  "/admin",
  "/portaria",
];

export function getAppVersion() {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.NEXT_PUBLIC_APP_VERSION?.trim() ||
    process.env.npm_package_version?.trim() ||
    "development"
  );
}

export function isSensitiveVersionUpdatePath(pathname: string) {
  return /^\/eventos\/[^/]+\/checkout(?:\/|$)/.test(pathname) ||
    sensitivePathPrefixes.some((prefix) =>
      pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function versionUpdateAction(input: {
  loadedVersion: string;
  currentVersion: string;
  pathname: string;
  refreshAlreadyAttempted: boolean;
}) {
  if (!input.currentVersion || input.currentVersion === input.loadedVersion) return "none" as const;
  if (input.refreshAlreadyAttempted || isSensitiveVersionUpdatePath(input.pathname)) return "prompt" as const;
  return "reload" as const;
}

export function versionRefreshKey(loadedVersion: string, currentVersion: string) {
  return `aaau:version-refresh:${loadedVersion}:${currentVersion}`;
}
