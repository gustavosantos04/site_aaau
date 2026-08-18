"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { clearAndRevokePortalSession, getPortalSessionFromCookie } from "@/lib/events/portal-cookie";
import { consumePortalRateLimits } from "@/lib/events/portal-rate-limit";
import { assertEventTicketTransferCsrf } from "@/lib/events/transfer-http-security";
import {
  cancelEventTicketTransferByHolder,
  transferEventTicketDirectly,
} from "@/lib/events/transfer-flow";
import { deliverEventTicketOutboxImmediately } from "@/lib/events/immediate-outbox";
import { logEventTicketOperation } from "@/lib/events/operations-log";

export type PortalMutationState = { message: string; ok: boolean };

function scheduleTransferEmail(outboxIds: string[]) {
  if (!outboxIds.length) return;
  after(async () => {
    await deliverEventTicketOutboxImmediately({ transferOutboxIds: outboxIds }).catch(() => undefined);
  });
}

async function authorize(action: string) {
  const [session, headerStore] = await Promise.all([getPortalSessionFromCookie(false), headers()]);
  if (!session) throw new Error("EVENT_TICKET_PORTAL_SESSION_INVALID");
  assertEventTicketTransferCsrf(headerStore);
  const allowed = await consumePortalRateLimits({
    action,
    ip: headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
    emailHash: session.emailHash,
    limit: 12,
  });
  if (!allowed) throw new Error("EVENT_TICKET_PORTAL_RATE_LIMITED");
  return session;
}

export async function requestPortalTransferAction(
  ticketId: string,
  _previous: PortalMutationState,
  formData: FormData,
): Promise<PortalMutationState> {
  try {
    const session = await authorize("portal-transfer-request");
    if (formData.get("confirmed") !== "yes") return { ok: false, message: "Revise e confirme a transferência." };
    const result = await transferEventTicketDirectly({
      ticketId,
      portalSessionId: session.id,
      requestId: String(formData.get("requestId") ?? ""),
      recipient: {
        name: String(formData.get("name") ?? ""),
        cpf: String(formData.get("cpf") ?? ""),
        email: String(formData.get("recipientEmail") ?? ""),
        phone: String(formData.get("phone") ?? "") || null,
        birthDate: String(formData.get("birthDate") ?? "") || null,
        institution: String(formData.get("institution") ?? "") || null,
        course: String(formData.get("course") ?? "") || null,
        campus: String(formData.get("campus") ?? "") || null,
      },
    });
    scheduleTransferEmail(result.outboxIds);
    revalidatePath("/meus-ingressos/painel");
    return { ok: true, message: "Transferência concluída. O ingresso anterior foi invalidado e o novo titular já recebeu a nova credencial." };
  } catch {
    return { ok: false, message: "Não foi possível concluir a transferência. Revise os dados ou tente novamente mais tarde." };
  }
}

export async function cancelPortalTransferAction(ticketId: string) {
  try {
    const session = await authorize("portal-transfer-cancel");
    const result = await cancelEventTicketTransferByHolder({ ticketId, holderCredential: { kind: "PORTAL_SESSION", portalSessionId: session.id } });
    logEventTicketOperation("transfer.canceled", { transferId: result.transferId });
    scheduleTransferEmail(result.outboxIds);
  } catch {
    // A interface não distingue falta de autorização de uma solicitação já encerrada.
  }
  revalidatePath("/meus-ingressos/painel");
}

export async function logoutPortalAction() {
  await clearAndRevokePortalSession();
  redirect("/meus-ingressos" as never);
}
