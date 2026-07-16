export function normalizeEventImagePath(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replaceAll("\\", "/");
  if (/^https?:\/\//i.test(normalized) || normalized.startsWith("/")) return normalized;
  return `/${normalized}`;
}
