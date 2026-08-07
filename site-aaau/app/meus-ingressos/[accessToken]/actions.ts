"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";

import { requestEventTicketTransfer } from "@/lib/events/transfer-flow";
import { assertEventTicketTransferCsrf, assertEventTicketTransferRateLimit } from "@/lib/events/transfer-http-security";
import { deliverEventTicketOutboxImmediately } from "@/lib/events/immediate-outbox";
import { logEventTicketOperation } from "@/lib/events/operations-log";

export async function requestTransferAction(
  accessToken: string,
  ticketId: string,
  accessKind: "ORIGINAL_ORDER" | "INDIVIDUAL_GRANT",
  formData: FormData,
) {
  const headerStore = await headers();
  assertEventTicketTransferCsrf(headerStore);
  assertEventTicketTransferRateLimit({
    action: "request",
    opaqueCredential: accessToken,
    ip: headerStore.get("x-forwarded-for")?.split(",")[0]?.trim(),
  });
  const result = await requestEventTicketTransfer({
    ticketId,
    holderCredential: accessKind === "ORIGINAL_ORDER"
      ? { kind: "ORIGINAL_ORDER", orderAccessToken: accessToken }
      : { kind: "INDIVIDUAL_GRANT", grantToken: accessToken },
    recipientEmail: String(formData.get("recipientEmail") ?? ""),
  });
  if (result.created) logEventTicketOperation("transfer.requested", { transferId: result.transferId });
  if (result.outboxIds.length) after(async () => {
    await deliverEventTicketOutboxImmediately({ transferOutboxIds: result.outboxIds }).catch(() => undefined);
  });
  redirect(`/meus-ingressos/${encodeURIComponent(accessToken)}?transferencia=solicitada`);
}
