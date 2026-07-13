import QRCode from "qrcode";
import type { EventTicketStatus } from "@prisma/client";

import { buildAbsoluteUrl } from "@/lib/site-url";

export function buildEventTicketQrPayload(qrToken: string, options: { allowLocalhost?: boolean } = {}) {
  return buildAbsoluteUrl(`/checkin/${encodeURIComponent(qrToken)}`, options);
}

export async function renderEventTicketQrSvg(qrToken: string, options: { allowLocalhost?: boolean } = {}) {
  return QRCode.toString(buildEventTicketQrPayload(qrToken, options), {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 280,
    color: {
      dark: "#080607",
      light: "#ffffff",
    },
  });
}

export function eventTicketStatusLabel(status: EventTicketStatus) {
  switch (status) {
    case "VALID":
      return "Ingresso valido";
    case "USED":
      return "Ingresso utilizado";
    case "CANCELED":
      return "Ingresso cancelado";
    case "REFUNDED":
      return "Ingresso reembolsado";
  }
}

export function eventTicketStatusTone(status: EventTicketStatus) {
  switch (status) {
    case "VALID":
      return "border-aaau-sand/40 bg-aaau-sand/15 text-aaau-sand";
    case "USED":
      return "border-white/20 bg-white/10 text-white/75";
    case "CANCELED":
    case "REFUNDED":
      return "border-red-300/30 bg-red-400/10 text-red-100";
  }
}
