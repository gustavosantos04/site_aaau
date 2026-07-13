import { cpfHash, onlyDigits } from "@/lib/checkout/mercado-pago";

export function normalizeTicketCodeSearch(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizeNameSearch(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function buildCpfHashForPortariaSearch(value: string) {
  const digits = onlyDigits(value);
  return digits.length === 11 ? cpfHash(digits) : null;
}
