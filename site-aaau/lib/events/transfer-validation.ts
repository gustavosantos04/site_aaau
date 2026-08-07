import { z } from "zod";

import {
  cpfHash,
  isValidCpf,
  onlyDigits,
  sanitizeText,
} from "@/lib/checkout/mercado-pago";
import { normalizeEventTicketHolderEmail } from "@/lib/events/transfer-security";

export type EventTicketTransferRecipientInput = {
  name: string;
  cpf: string;
  email: string;
  phone?: string | null;
  birthDate?: Date | string | null;
  institution?: string | null;
  course?: string | null;
  campus?: string | null;
};

const emailSchema = z.string().email().max(160);

function optionalText(value: string | null | undefined, maxLength: number) {
  if (!value) return null;
  const normalized = sanitizeText(value);
  if (!normalized) return null;
  if (normalized.length > maxLength) throw new Error("EVENT_TICKET_TRANSFER_RECIPIENT_INVALID");
  return normalized;
}

export function normalizeEventTicketTransferRecipient(
  input: EventTicketTransferRecipientInput,
  event: {
    requireParticipantEmail: boolean;
    requireParticipantPhone: boolean;
    requireBirthDate: boolean;
    requireInstitution: boolean;
    requireCourse: boolean;
    requireCampus: boolean;
    minimumAge?: number | null;
    startAt?: Date;
  },
) {
  const name = sanitizeText(input.name);
  const cpf = onlyDigits(input.cpf);
  const email = normalizeEventTicketHolderEmail(input.email);
  const phone = onlyDigits(input.phone ?? "") || null;
  const birthDate = input.birthDate ? new Date(input.birthDate) : null;
  const institution = optionalText(input.institution, 120);
  const course = optionalText(input.course, 120);
  const campus = optionalText(input.campus, 120);

  if (name.length < 2 || name.length > 120 || !isValidCpf(cpf)) {
    throw new Error("EVENT_TICKET_TRANSFER_RECIPIENT_INVALID");
  }
  if (!emailSchema.safeParse(email).success) {
    throw new Error("EVENT_TICKET_TRANSFER_RECIPIENT_INVALID");
  }
  if (phone && (phone.length < 10 || phone.length > 15)) {
    throw new Error("EVENT_TICKET_TRANSFER_RECIPIENT_INVALID");
  }
  if (birthDate && Number.isNaN(birthDate.getTime())) {
    throw new Error("EVENT_TICKET_TRANSFER_RECIPIENT_INVALID");
  }
  if (event.requireParticipantEmail && !email) throw new Error("EVENT_TICKET_TRANSFER_RECIPIENT_INVALID");
  if (event.requireParticipantPhone && !phone) throw new Error("EVENT_TICKET_TRANSFER_RECIPIENT_INVALID");
  if (event.requireBirthDate && !birthDate) throw new Error("EVENT_TICKET_TRANSFER_RECIPIENT_INVALID");
  if (event.requireInstitution && !institution) throw new Error("EVENT_TICKET_TRANSFER_RECIPIENT_INVALID");
  if (event.requireCourse && !course) throw new Error("EVENT_TICKET_TRANSFER_RECIPIENT_INVALID");
  if (event.requireCampus && !campus) throw new Error("EVENT_TICKET_TRANSFER_RECIPIENT_INVALID");
  if (event.minimumAge !== null && event.minimumAge !== undefined) {
    if (!birthDate) throw new Error("EVENT_TICKET_TRANSFER_RECIPIENT_INVALID");
    const reference = event.startAt ?? new Date();
    let age = reference.getUTCFullYear() - birthDate.getUTCFullYear();
    const birthdayNotReached =
      reference.getUTCMonth() < birthDate.getUTCMonth() ||
      (reference.getUTCMonth() === birthDate.getUTCMonth() &&
        reference.getUTCDate() < birthDate.getUTCDate());
    if (birthdayNotReached) age -= 1;
    if (age < event.minimumAge) throw new Error("EVENT_TICKET_TRANSFER_RECIPIENT_INVALID");
  }

  return {
    name,
    cpf,
    cpfHash: cpfHash(cpf),
    cpfLast4: cpf.slice(-4),
    email,
    phone,
    birthDate,
    institution,
    course,
    campus,
  };
}
