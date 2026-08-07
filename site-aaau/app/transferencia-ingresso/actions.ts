"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";

import {
  acceptEventTicketTransfer,
  cancelEventTicketTransfer,
  confirmEventTicketTransfer,
  rejectEventTicketTransfer,
} from "@/lib/events/transfer-flow";
import { assertEventTicketTransferCsrf, assertEventTicketTransferRateLimit } from "@/lib/events/transfer-http-security";
import { deliverEventTicketOutboxImmediately } from "@/lib/events/immediate-outbox";
import { logEventTicketOperation } from "@/lib/events/operations-log";

async function protect(action: string, token: string) {
  const headerStore = await headers();
  assertEventTicketTransferCsrf(headerStore);
  assertEventTicketTransferRateLimit({
    action,
    opaqueCredential: token,
    ip: headerStore.get("x-forwarded-for")?.split(",")[0]?.trim(),
  });
}

function destinationFor(error: unknown) {
  return error instanceof Error && error.message === "EVENT_TICKET_TRANSFER_EXPIRED"
    ? "/transferencia-ingresso/expirada"
    : "/transferencia-ingresso/cancelada";
}

function scheduleTransferEmail(outboxIds: string[]) {
  if (!outboxIds.length) return;
  after(async () => {
    await deliverEventTicketOutboxImmediately({ transferOutboxIds: outboxIds }).catch(() => undefined);
  });
}

export async function confirmTransferAction(token: string) {
  await protect("confirm", token);
  let destination = "/transferencia-ingresso/sucesso";
  try {
    const result = await confirmEventTicketTransfer(token);
    logEventTicketOperation("transfer.holder_confirmed", { transferId: result.transferId });
    scheduleTransferEmail(result.outboxIds);
  } catch (error) {
    destination = destinationFor(error);
  }
  redirect(destination as never);
}

export async function cancelTransferAction(token: string) {
  await protect("cancel", token);
  try {
    const result = await cancelEventTicketTransfer(token);
    logEventTicketOperation("transfer.canceled", { transferId: result.transferId });
    scheduleTransferEmail(result.outboxIds);
  } catch {
    // A resposta pública permanece neutra para tokens inválidos ou já consumidos.
  }
  redirect("/transferencia-ingresso/cancelada" as never);
}

export async function acceptTransferAction(token: string, formData: FormData) {
  await protect("accept", token);
  let destination = "/transferencia-ingresso/sucesso";
  try {
    const result = await acceptEventTicketTransfer(token, {
      name: String(formData.get("name") ?? ""),
      cpf: String(formData.get("cpf") ?? ""),
      phone: String(formData.get("phone") ?? "") || null,
      birthDate: String(formData.get("birthDate") ?? "") || null,
      institution: String(formData.get("institution") ?? "") || null,
      course: String(formData.get("course") ?? "") || null,
      campus: String(formData.get("campus") ?? "") || null,
    });
    scheduleTransferEmail(result.outboxIds);
  } catch (error) {
    destination = destinationFor(error);
  }
  redirect(destination as never);
}

export async function rejectTransferAction(token: string) {
  await protect("reject", token);
  try {
    const result = await rejectEventTicketTransfer(token);
    logEventTicketOperation("transfer.rejected", { transferId: result.transferId });
    scheduleTransferEmail(result.outboxIds);
  } catch {
    // A resposta pública permanece neutra para tokens inválidos ou já consumidos.
  }
  redirect("/transferencia-ingresso/cancelada" as never);
}
