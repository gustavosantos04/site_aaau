import crypto from "node:crypto";
import { Prisma } from "@prisma/client";

import {
  QR_TOKEN_BYTES,
  TICKET_CODE_RETRY_LIMIT,
} from "@/lib/events/constants";
import {
  EventOrderInvalidStatusError,
  EventOrderNotFoundError,
} from "@/lib/events/errors";
import type { EventTx } from "@/lib/events/types";

function buildTicketCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  let suffix = "";

  for (let index = 0; index < 6; index += 1) {
    suffix += alphabet[bytes[index] % alphabet.length];
  }

  return `AU-${suffix}`;
}

function buildQrToken() {
  return `tk_${crypto.randomBytes(QR_TOKEN_BYTES).toString("base64url")}`;
}

async function createTicketWithRetry(
  tx: EventTx,
  data: {
    eventOrderId: string;
    eventId: string;
    lotId: string;
    orderParticipantId: string;
    participantName: string;
    participantCpf: string;
    participantCpfHash: string | null;
    participantCpfLast4: string | null;
    participantEmail: string | null;
    participantPhone: string | null;
    birthDate: Date | null;
    institution: string | null;
    course: string | null;
    campus: string | null;
    issuedAt: Date;
  },
) {
  for (let attempt = 0; attempt < TICKET_CODE_RETRY_LIMIT; attempt += 1) {
    try {
      await tx.eventTicket.create({
        data: {
          ...data,
          ticketCode: buildTicketCode(),
          qrToken: buildQrToken(),
          status: "VALID",
        },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Nao foi possivel gerar codigo unico de ingresso.");
}

export async function issueEventTicketsForPaidOrder(tx: EventTx, eventOrderId: string, issuedAt = new Date()) {
  const order = await tx.eventOrder.findUnique({
    where: { id: eventOrderId },
    include: {
      participants: {
        include: { ticket: true },
      },
    },
  });

  if (!order) {
    throw new EventOrderNotFoundError();
  }

  if (order.status !== "PAID") {
    throw new EventOrderInvalidStatusError();
  }

  let issued = 0;

  for (const participant of order.participants) {
    if (participant.ticket) {
      continue;
    }

    await createTicketWithRetry(tx, {
      eventOrderId: order.id,
      eventId: order.eventId,
      lotId: participant.ticketLotId,
      orderParticipantId: participant.id,
      participantName: participant.name,
      participantCpf: participant.cpf,
      participantCpfHash: participant.cpfHash,
      participantCpfLast4: participant.cpfLast4,
      participantEmail: participant.email,
      participantPhone: participant.phone,
      birthDate: participant.birthDate,
      institution: participant.institution,
      course: participant.course,
      campus: participant.campus,
      issuedAt,
    });
    issued += 1;
  }

  return issued;
}
