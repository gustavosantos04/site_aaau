"use server";

import { cookies, headers } from "next/headers";
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
import { eventTicketTransferErrorDestination } from "@/lib/events/transfer-action-errors";
import {
  eventTicketTransferCookieOptions,
  getEventTicketTransferBrowserConfig,
  type EventTicketTransferBrowserPurpose,
} from "@/lib/events/transfer-browser-session";

async function protect(action: string, token: string) {
  const headerStore = await headers();
  assertEventTicketTransferCsrf(headerStore);
  assertEventTicketTransferRateLimit({
    action,
    opaqueCredential: token,
    ip: headerStore.get("x-forwarded-for")?.split(",")[0]?.trim(),
  });
}

async function browserToken(purpose: EventTicketTransferBrowserPurpose) {
  const cookieStore = await cookies();
  return cookieStore.get(getEventTicketTransferBrowserConfig(purpose).cookieName)?.value ?? "";
}

async function clearBrowserToken(purpose: EventTicketTransferBrowserPurpose) {
  const cookieStore = await cookies();
  const config = getEventTicketTransferBrowserConfig(purpose);
  cookieStore.set(config.cookieName, "", { ...eventTicketTransferCookieOptions(purpose), maxAge: 0 });
}

function scheduleTransferEmail(outboxIds: string[]) {
  if (!outboxIds.length) return;
  after(async () => {
    await deliverEventTicketOutboxImmediately({ transferOutboxIds: outboxIds }).catch(() => undefined);
  });
}

export async function confirmTransferAction() {
  const token = await browserToken("confirm");
  if (!token) redirect("/transferencia-ingresso/cancelada" as never);
  await protect("confirm", token);
  let destination = "/transferencia-ingresso/sucesso";
  try {
    const result = await confirmEventTicketTransfer(token);
    logEventTicketOperation("transfer.holder_confirmed", { transferId: result.transferId });
    scheduleTransferEmail(result.outboxIds);
  } catch (error) {
    destination = eventTicketTransferErrorDestination(error);
  }
  await clearBrowserToken("confirm");
  redirect(destination as never);
}

export async function cancelTransferAction() {
  const token = await browserToken("confirm");
  if (!token) redirect("/transferencia-ingresso/cancelada" as never);
  await protect("cancel", token);
  try {
    const result = await cancelEventTicketTransfer(token);
    logEventTicketOperation("transfer.canceled", { transferId: result.transferId });
    scheduleTransferEmail(result.outboxIds);
  } catch {
    // A resposta pública permanece neutra para tokens inválidos ou já consumidos.
  }
  await clearBrowserToken("confirm");
  redirect("/transferencia-ingresso/cancelada" as never);
}

export async function acceptTransferAction(formData: FormData) {
  const token = await browserToken("accept");
  if (!token) redirect("/transferencia-ingresso/cancelada" as never);
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
    await clearBrowserToken("accept");
  } catch (error) {
    destination = eventTicketTransferErrorDestination(error, "/transferencia-ingresso/aceitar");
    if (destination !== "/transferencia-ingresso/aceitar?erro=dados") {
      await clearBrowserToken("accept");
    }
  }
  redirect(destination as never);
}

export async function rejectTransferAction() {
  const token = await browserToken("accept");
  if (!token) redirect("/transferencia-ingresso/cancelada" as never);
  await protect("reject", token);
  try {
    const result = await rejectEventTicketTransfer(token);
    logEventTicketOperation("transfer.rejected", { transferId: result.transferId });
    scheduleTransferEmail(result.outboxIds);
  } catch {
    // A resposta pública permanece neutra para tokens inválidos ou já consumidos.
  }
  await clearBrowserToken("accept");
  redirect("/transferencia-ingresso/cancelada" as never);
}
