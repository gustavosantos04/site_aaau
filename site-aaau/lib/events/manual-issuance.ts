import crypto from "node:crypto";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { onlyDigits } from "@/lib/checkout/mercado-pago";
import { prisma } from "@/lib/db/prisma";
import { createEventAdminAuditLog } from "@/lib/events/audit";
import { ensureEventTicketConfirmationEmail, type EventTicketEmailSender } from "@/lib/events/email";
import { EventAdminValidationError, assertSuperAdmin, type EventAdminActor } from "@/lib/events/admin";
import {
  assertRequiredEventParticipantFields,
  normalizeEventParticipant,
} from "@/lib/events/orders";
import { createEventTicketWithRetry } from "@/lib/events/tickets";
import { runSerializableTransactionWithRetry } from "@/lib/events/transaction";

const manualIssuanceSchema = z.object({
  eventId: z.string().min(1),
  idempotencyKey: z.string().uuid(),
  type: z.enum(["ADMIN_PIX", "COMPLIMENTARY"]),
  amountReceived: z.instanceof(Prisma.Decimal),
  participant: z.object({
    name: z.string(), cpf: z.string(), email: z.string().trim().email("Informe um e-mail valido."), phone: z.string().optional(),
    birthDate: z.union([z.string(), z.date()]).optional(), institution: z.string().optional(),
    course: z.string().optional(), campus: z.string().optional(),
  }),
});

export type ManualTicketIssuanceInput = z.input<typeof manualIssuanceSchema>;

export async function issueManualEventTicket(
  rawInput: ManualTicketIssuanceInput,
  actor: EventAdminActor,
  options: { emailSender?: EventTicketEmailSender; emailFrom?: string; baseUrl?: string } = {},
) {
  assertSuperAdmin(actor);
  const parsed = manualIssuanceSchema.safeParse(rawInput);
  if (!parsed.success) throw new EventAdminValidationError(parsed.error.issues[0]?.message ?? "Dados invalidos.");
  const input = parsed.data;
  if (input.type === "COMPLIMENTARY" && !input.amountReceived.equals(0)) {
    throw new EventAdminValidationError("Cortesia precisa ter valor recebido igual a zero.");
  }
  if (input.type === "ADMIN_PIX" && input.amountReceived.lessThan(0)) {
    throw new EventAdminValidationError("O valor recebido nao pode ser negativo.");
  }
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify({
    eventId: input.eventId, type: input.type, amount: input.amountReceived.toString(),
    name: input.participant.name.trim(), cpf: onlyDigits(input.participant.cpf),
    email: input.participant.email.trim().toLowerCase(), phone: onlyDigits(input.participant.phone ?? ""),
    birthDate: input.participant.birthDate ? String(input.participant.birthDate) : null,
    institution: input.participant.institution?.trim() || null, course: input.participant.course?.trim() || null,
    campus: input.participant.campus?.trim() || null,
  })).digest("hex");

  const result = await runSerializableTransactionWithRetry(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.eventId}))`;
    const existing = await tx.eventOrder.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { tickets: true },
    });
    if (existing) {
      if (existing.eventId !== input.eventId || existing.source !== input.type || existing.payloadFingerprint !== fingerprint) {
        throw new EventAdminValidationError("Esta chave de emissao ja foi utilizada com outros dados.");
      }
      return { orderId: existing.id, ticketId: existing.tickets[0]?.id ?? null, alreadyCreated: true };
    }

    const event = await tx.ticketEvent.findUnique({ where: { id: input.eventId } });
    if (!event) throw new EventAdminValidationError("Evento nao encontrado.");
    if (event.status === "CANCELED") throw new EventAdminValidationError("Nao e possivel emitir para evento cancelado.");
    const participant = normalizeEventParticipant(input.participant, 0);
    assertRequiredEventParticipantFields(event, participant, 0);

    const duplicate = await tx.eventTicket.findFirst({
      where: { eventId: event.id, participantCpfHash: participant.cpfHash, status: { in: ["VALID", "USED"] } },
      select: { id: true },
    });
    if (duplicate) throw new EventAdminValidationError("Ja existe ingresso ativo para este CPF neste evento.");

    let lot = await tx.eventTicketLot.findFirst({
      where: { eventId: event.id, publicSaleEnabled: false }, orderBy: { createdAt: "asc" },
    });
    if (!lot) {
      const lastLot = await tx.eventTicketLot.aggregate({ where: { eventId: event.id }, _max: { position: true } });
      lot = await tx.eventTicketLot.create({
        data: {
          eventId: event.id, name: "Gestao / Atletas / Cortesias",
          description: "Lote administrativo, indisponivel no checkout publico.",
          price: new Prisma.Decimal(0), quantity: 0, active: true, autoActivate: false,
          publicSaleEnabled: false, position: (lastLot._max.position ?? 0) + 1,
        },
      });
    }

    const orderId = crypto.randomUUID();
    const order = await tx.eventOrder.create({
      data: {
        id: orderId, eventId: event.id, ticketLotId: lot.id, source: input.type,
        commercialUnitQuantity: 1, ticketsPerUnit: 1, commercialUnitPrice: input.amountReceived,
        buyerName: participant.name, buyerCpf: participant.cpf, buyerCpfHash: participant.cpfHash,
        buyerCpfLast4: participant.cpfLast4, buyerEmail: participant.email ?? "",
        buyerPhone: participant.phone ?? "", subtotal: input.amountReceived, discountAmount: 0,
        total: input.amountReceived, status: "PAID", paymentMethodId: input.type === "ADMIN_PIX" ? "EXTERNAL_PIX" : "COMPLIMENTARY",
        externalReference: `admin_event_order:${orderId}`, idempotencyKey: input.idempotencyKey,
        payloadFingerprint: fingerprint,
        accessToken: crypto.randomBytes(32).toString("base64url"), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        paidAt: new Date(),
        participants: { create: { ticketLotId: lot.id, ...participant } },
      },
      include: { participants: true },
    });
    const createdParticipant = order.participants[0];
    const issuedAt = new Date();
    const ticket = await createEventTicketWithRetry(tx, {
      eventOrderId: order.id, eventId: event.id, lotId: lot.id, orderParticipantId: createdParticipant.id,
      participantName: participant.name, participantCpf: participant.cpf, participantCpfHash: participant.cpfHash,
      participantCpfLast4: participant.cpfLast4, participantEmail: participant.email, participantPhone: participant.phone,
      birthDate: participant.birthDate, institution: participant.institution, course: participant.course, campus: participant.campus,
      issuedAt,
    });
    await tx.eventTicketLot.update({ where: { id: lot.id }, data: { quantity: { increment: 1 }, soldQuantity: { increment: 1 } } });
    await createEventAdminAuditLog(tx, {
      eventId: event.id, adminUserId: actor.adminUserId, action: "MANUAL_TICKET_ISSUED",
      targetType: "EventTicket", targetId: ticket.id,
      metadata: { adminEmail: actor.email ?? null, participantName: participant.name, participantCpfLast4: participant.cpfLast4, type: input.type, amountReceived: input.amountReceived.toString(), orderId },
    });
    return { orderId, ticketId: ticket.id, alreadyCreated: false };
  });

  const email = result.alreadyCreated
    ? { sent: false, skipped: true, reason: "already_created" as const }
    : await ensureEventTicketConfirmationEmail(result.orderId, {
        sender: options.emailSender, from: options.emailFrom, baseUrl: options.baseUrl,
        idempotencyKey: `manual-event-ticket/${result.orderId}`,
      });
  return { ...result, email };
}
