"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  eventTicketTransferCookieOptions,
  getEventTicketTransferBrowserConfig,
  type EventTicketTransferBrowserPurpose,
} from "@/lib/events/transfer-browser-session";

async function clearBrowserToken(purpose: EventTicketTransferBrowserPurpose) {
  const cookieStore = await cookies();
  const config = getEventTicketTransferBrowserConfig(purpose);
  cookieStore.set(config.cookieName, "", { ...eventTicketTransferCookieOptions(purpose), maxAge: 0 });
}

export async function confirmTransferAction() {
  await clearBrowserToken("confirm");
  redirect("/transferencia-ingresso/cancelada?legado=1" as never);
}

export async function cancelTransferAction() {
  await clearBrowserToken("confirm");
  redirect("/transferencia-ingresso/cancelada?legado=1" as never);
}

export async function acceptTransferAction(formData: FormData) {
  void formData;
  await clearBrowserToken("accept");
  redirect("/transferencia-ingresso/cancelada?legado=1" as never);
}

export async function rejectTransferAction() {
  await clearBrowserToken("accept");
  redirect("/transferencia-ingresso/cancelada?legado=1" as never);
}
