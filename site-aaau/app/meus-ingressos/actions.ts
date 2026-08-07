"use server";

import { headers } from "next/headers";
import { after } from "next/server";

import { assertEventTicketTransferCsrf } from "@/lib/events/transfer-http-security";
import { deliverEventTicketOutboxImmediately } from "@/lib/events/immediate-outbox";
import { requestEventTicketPortalAccess } from "@/lib/events/portal-session";

export type PortalAccessFormState = { message: string };
const PORTAL_NEUTRAL_MESSAGE = "Se encontrarmos ingressos vinculados a esse e-mail, enviaremos um link de acesso.";

export async function requestPortalAccessAction(
  _previous: PortalAccessFormState,
  formData: FormData,
): Promise<PortalAccessFormState> {
  const headerStore = await headers();
  try {
    assertEventTicketTransferCsrf(headerStore);
    const result = await requestEventTicketPortalAccess({
      email: String(formData.get("email") ?? ""),
      ip: headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
    });
    // Keep the public response independent from SMTP latency and from whether the
    // submitted address produced an outbox row.
    if (result.created && result.outboxId) after(async () => {
      await deliverEventTicketOutboxImmediately({ portalOutboxIds: [result.outboxId] }).catch(() => undefined);
    });
  } catch {
    // Resposta deliberadamente idêntica para endereço ausente, inválido, limitado ou falha temporária.
  }
  return { message: PORTAL_NEUTRAL_MESSAGE };
}
