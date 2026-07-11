"use server";

import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { requireAdminRole } from "@/lib/auth";
import {
  assignEventStaff,
  createEventStaffUser,
  setEventStaffAssignmentActive,
} from "@/lib/portaria";
import {
  cancelTicketEventAdmin,
  createPartnerCodeAdmin,
  createTicketEventAdmin,
  createTicketLotAdmin,
  parseAdminDecimal,
  parseSaoPauloDateTime,
  publishTicketEventAdmin,
  resendTicketConfirmationEmailAdmin,
  unpublishTicketEventAdmin,
  updatePartnerCodeAdmin,
  updateTicketEventAdmin,
  updateTicketLotAdmin,
  type EventPartnerCodeAdminInput,
  type EventTicketLotAdminInput,
  type TicketEventAdminInput,
} from "@/lib/events/admin";

export type AdminEventFormState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const idle: AdminEventFormState = { status: "idle" };

function bool(formData: FormData, name: string) {
  return formData.get(name) === "on" || formData.get(name) === "true";
}

function intValue(formData: FormData, name: string, fallback: number) {
  const value = Number(formData.get(name) ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function eventInput(formData: FormData): TicketEventAdminInput {
  return {
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    shortDescription: String(formData.get("shortDescription") ?? ""),
    description: String(formData.get("description") ?? ""),
    bannerImage: String(formData.get("bannerImage") ?? "") || null,
    coverImage: String(formData.get("coverImage") ?? "") || null,
    startAt: parseSaoPauloDateTime(String(formData.get("startAt") ?? "")) ?? new Date("invalid"),
    endAt: parseSaoPauloDateTime(String(formData.get("endAt") ?? "")),
    salesStartAt: parseSaoPauloDateTime(String(formData.get("salesStartAt") ?? "")),
    salesEndAt: parseSaoPauloDateTime(String(formData.get("salesEndAt") ?? "")),
    venueName: String(formData.get("venueName") ?? ""),
    venueAddress: String(formData.get("venueAddress") ?? "") || null,
    minimumAge: formData.get("minimumAge") ? intValue(formData, "minimumAge", 0) : null,
    published: bool(formData, "published"),
    showRemainingTickets: bool(formData, "showRemainingTickets"),
    maxTicketsPerOrder: intValue(formData, "maxTicketsPerOrder", 4),
    lowStockThreshold: intValue(formData, "lowStockThreshold", 10),
    requireParticipantEmail: bool(formData, "requireParticipantEmail"),
    requireParticipantPhone: bool(formData, "requireParticipantPhone"),
    requireBirthDate: bool(formData, "requireBirthDate"),
    requireInstitution: bool(formData, "requireInstitution"),
    requireCourse: bool(formData, "requireCourse"),
    requireCampus: bool(formData, "requireCampus"),
  };
}

function lotInput(formData: FormData): EventTicketLotAdminInput {
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? "") || null,
    price: parseAdminDecimal(String(formData.get("price") ?? "")),
    quantity: intValue(formData, "quantity", 0),
    salesStartAt: parseSaoPauloDateTime(String(formData.get("salesStartAt") ?? "")),
    salesEndAt: parseSaoPauloDateTime(String(formData.get("salesEndAt") ?? "")),
    position: intValue(formData, "position", 1),
    active: bool(formData, "active"),
    autoActivate: bool(formData, "autoActivate"),
  };
}

function codeInput(formData: FormData): EventPartnerCodeAdminInput {
  return {
    code: String(formData.get("code") ?? ""),
    partnerName: String(formData.get("partnerName") ?? ""),
    partnerType: String(formData.get("partnerType") ?? "PARTNER") as EventPartnerCodeAdminInput["partnerType"],
    discountType: String(formData.get("discountType") ?? "PERCENTAGE") as EventPartnerCodeAdminInput["discountType"],
    discountValue: parseAdminDecimal(String(formData.get("discountValue") ?? "")),
    maxUses: formData.get("maxUses") ? intValue(formData, "maxUses", 0) : null,
    startsAt: parseSaoPauloDateTime(String(formData.get("startsAt") ?? "")),
    expiresAt: parseSaoPauloDateTime(String(formData.get("expiresAt") ?? "")),
    active: bool(formData, "active"),
  };
}

function errorState(error: unknown): AdminEventFormState {
  return {
    status: "error",
    message: error instanceof Error ? error.message : "Nao foi possivel concluir a acao.",
  };
}

function revalidateEventAdmin(eventId?: string, slug?: string) {
  revalidatePath("/admin/eventos");
  if (eventId) revalidatePath(`/admin/eventos/${eventId}` as Route);
  revalidatePath("/eventos");
  if (slug) revalidatePath(`/eventos/${slug}`);
}

export async function createEventAction(
  _prevState: AdminEventFormState = idle,
  formData: FormData,
): Promise<AdminEventFormState> {
  const actor = await requireAdminRole("super_admin");
  let eventId: string | null = null;
  try {
    const event = await createTicketEventAdmin(eventInput(formData), actor);
    eventId = event.id;
    revalidateEventAdmin(event.id, event.slug);
  } catch (error) {
    return errorState(error);
  }
  redirect(`/admin/eventos/${eventId}` as Route);
}

export async function updateEventAction(
  _prevState: AdminEventFormState = idle,
  formData: FormData,
): Promise<AdminEventFormState> {
  const actor = await requireAdminRole("super_admin");
  const eventId = String(formData.get("eventId") ?? "");
  try {
    const event = await updateTicketEventAdmin(eventId, eventInput(formData), actor);
    revalidateEventAdmin(event.id, event.slug);
    return { status: "success", message: "Evento salvo." };
  } catch (error) {
    return errorState(error);
  }
}

export async function eventStatusAction(formData: FormData) {
  const actor = await requireAdminRole("super_admin");
  const eventId = String(formData.get("eventId") ?? "");
  const operation = String(formData.get("operation") ?? "");
  if (operation === "publish") await publishTicketEventAdmin(eventId, actor);
  if (operation === "unpublish") await unpublishTicketEventAdmin(eventId, actor);
  if (operation === "cancel") await cancelTicketEventAdmin(eventId, actor);
  revalidateEventAdmin(eventId);
}

export async function saveLotAction(
  _prevState: AdminEventFormState = idle,
  formData: FormData,
): Promise<AdminEventFormState> {
  const actor = await requireAdminRole("super_admin");
  const eventId = String(formData.get("eventId") ?? "");
  const lotId = String(formData.get("lotId") ?? "");
  try {
    if (lotId) await updateTicketLotAdmin(lotId, lotInput(formData), actor);
    else await createTicketLotAdmin(eventId, lotInput(formData), actor);
    revalidateEventAdmin(eventId);
    return { status: "success", message: lotId ? "Lote atualizado." : "Lote criado." };
  } catch (error) {
    return errorState(error);
  }
}

export async function savePartnerCodeAction(
  _prevState: AdminEventFormState = idle,
  formData: FormData,
): Promise<AdminEventFormState> {
  const actor = await requireAdminRole("super_admin");
  const eventId = String(formData.get("eventId") ?? "");
  const codeId = String(formData.get("codeId") ?? "");
  try {
    if (codeId) await updatePartnerCodeAdmin(codeId, codeInput(formData), actor);
    else await createPartnerCodeAdmin(eventId, codeInput(formData), actor);
    revalidateEventAdmin(eventId);
    return { status: "success", message: codeId ? "Codigo atualizado." : "Codigo criado." };
  } catch (error) {
    return errorState(error);
  }
}

export async function resendTicketEmailAction(formData: FormData) {
  const actor = await requireAdminRole("super_admin");
  const eventOrderId = String(formData.get("eventOrderId") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  const confirmAmbiguous = formData.get("confirmAmbiguous") === "on";
  await resendTicketConfirmationEmailAdmin({ eventOrderId, confirmAmbiguous, actor });
  revalidateEventAdmin(eventId);
}

export async function createEventStaffAction(formData: FormData) {
  const actor = await requireAdminRole("super_admin");
  const eventId = String(formData.get("eventId") ?? "");
  await createEventStaffUser({
    actor,
    eventId,
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    active: bool(formData, "active"),
  });
  revalidateEventAdmin(eventId);
}

export async function assignEventStaffAction(formData: FormData) {
  const actor = await requireAdminRole("super_admin");
  const eventId = String(formData.get("eventId") ?? "");
  const adminUserId = String(formData.get("adminUserId") ?? "");
  await assignEventStaff({ actor, eventId, adminUserId });
  revalidateEventAdmin(eventId);
}

export async function setEventStaffAssignmentAction(formData: FormData) {
  const actor = await requireAdminRole("super_admin");
  const eventId = String(formData.get("eventId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  await setEventStaffAssignmentActive({ actor, eventId, assignmentId, active });
  revalidateEventAdmin(eventId);
}
