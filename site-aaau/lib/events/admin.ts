import { Prisma } from "@prisma/client";
import { z } from "zod";

import { cpfHash, onlyDigits } from "@/lib/checkout/mercado-pago";
import { prisma } from "@/lib/db/prisma";
import {
  AmbiguousEventTicketEmailError,
  type EventTicketEmailSender,
  ensureEventTicketConfirmationEmail,
} from "@/lib/events/email";
import { getTicketLotAvailability } from "@/lib/events/availability";
import { normalizeEventImagePath } from "@/lib/events/images";
import { formatMoney, getPublicEventStatus, publicStatusLabel } from "@/lib/events/public";

export type EventAdminActor = {
  role: "super_admin" | "event_staff";
  adminUserId?: string | null;
};

export class EventAdminForbiddenError extends Error {
  constructor() {
    super("Apenas super_admin pode executar esta acao.");
  }
}

export class EventAdminValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

const eventInputSchema = z.object({
  name: z.string().trim().min(3, "Informe o nome do evento."),
  slug: z.string().trim().optional(),
  shortDescription: z.string().trim().min(8, "Informe uma descricao curta."),
  description: z.string().trim().min(8, "Informe a descricao do evento."),
  bannerImage: z.string().trim().optional().nullable(),
  coverImage: z.string().trim().optional().nullable(),
  startAt: z.date(),
  endAt: z.date().optional().nullable(),
  salesStartAt: z.date().optional().nullable(),
  salesEndAt: z.date().optional().nullable(),
  venueName: z.string().trim().min(2, "Informe o local."),
  venueAddress: z.string().trim().optional().nullable(),
  minimumAge: z.number().int().min(0).optional().nullable(),
  published: z.boolean().default(false),
  showRemainingTickets: z.boolean().default(false),
  maxTicketsPerOrder: z.number().int().min(1).max(20),
  lowStockThreshold: z.number().int().min(0).max(1000),
  requireParticipantEmail: z.boolean().default(false),
  requireParticipantPhone: z.boolean().default(false),
  requireBirthDate: z.boolean().default(false),
  requireInstitution: z.boolean().default(false),
  requireCourse: z.boolean().default(false),
  requireCampus: z.boolean().default(false),
});

const lotInputSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do lote."),
  description: z.string().trim().optional().nullable(),
  price: z.instanceof(Prisma.Decimal),
  quantity: z.number().int().positive("Informe uma quantidade maior que zero."),
  salesStartAt: z.date().optional().nullable(),
  salesEndAt: z.date().optional().nullable(),
  position: z.number().int().min(1),
  active: z.boolean().default(true),
  autoActivate: z.boolean().default(true),
});

const partnerCodeInputSchema = z.object({
  code: z.string().trim().min(2, "Informe o codigo."),
  partnerName: z.string().trim().min(2, "Informe o parceiro."),
  partnerType: z.enum(["ATHLETIC", "PARTNER", "PROMOTION", "OTHER"]),
  discountType: z.enum(["PERCENTAGE", "FIXED"]),
  discountValue: z.instanceof(Prisma.Decimal),
  maxUses: z.number().int().positive().optional().nullable(),
  startsAt: z.date().optional().nullable(),
  expiresAt: z.date().optional().nullable(),
  active: z.boolean().default(true),
});

export type TicketEventAdminInput = z.input<typeof eventInputSchema>;
export type EventTicketLotAdminInput = z.input<typeof lotInputSchema>;
export type EventPartnerCodeAdminInput = z.input<typeof partnerCodeInputSchema>;

export function assertSuperAdmin(actor: EventAdminActor) {
  if (actor.role !== "super_admin") {
    throw new EventAdminForbiddenError();
  }
}

export function normalizeEventSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function normalizePartnerCodeAdmin(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function parseSaoPauloDateTime(value?: string | null) {
  if (!value?.trim()) return null;
  return new Date(`${value.trim()}:00-03:00`);
}

function assertDateRange(input: {
  startAt?: Date | null;
  endAt?: Date | null;
  salesStartAt?: Date | null;
  salesEndAt?: Date | null;
}) {
  if (input.endAt && input.startAt && input.endAt <= input.startAt) {
    throw new EventAdminValidationError("O fim do evento precisa ser posterior ao inicio.");
  }

  if (input.salesStartAt && input.salesEndAt && input.salesEndAt <= input.salesStartAt) {
    throw new EventAdminValidationError("O fim das vendas precisa ser posterior ao inicio das vendas.");
  }
}

function assertLotDates(input: { salesStartAt?: Date | null; salesEndAt?: Date | null }) {
  if (input.salesStartAt && input.salesEndAt && input.salesEndAt <= input.salesStartAt) {
    throw new EventAdminValidationError("O fim do lote precisa ser posterior ao inicio.");
  }
}

function assertPartnerDates(input: { startsAt?: Date | null; expiresAt?: Date | null }) {
  if (input.startsAt && input.expiresAt && input.expiresAt <= input.startsAt) {
    throw new EventAdminValidationError("A validade do codigo precisa terminar depois do inicio.");
  }
}

function assertPaidLotSupported(price: Prisma.Decimal) {
  if (price.lessThanOrEqualTo(0)) {
    throw new EventAdminValidationError("Eventos gratuitos ainda nao sao suportados pelo checkout atual.");
  }
}

async function audit(input: {
  actor: EventAdminActor;
  eventId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await prisma.eventAdminAuditLog.create({
    data: {
      eventId: input.eventId ?? null,
      adminUserId: input.actor.adminUserId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
    },
  });
}

function publicStatus(event: Parameters<typeof getPublicEventStatus>[0]) {
  return publicStatusLabel(getPublicEventStatus(event));
}

function lotStatus(lot: {
  active: boolean;
  quantity: number;
  reservedQuantity: number;
  soldQuantity: number;
  salesStartAt: Date | null;
  salesEndAt: Date | null;
}, now = new Date()) {
  if (!lot.active) return "INATIVO";
  if (getTicketLotAvailability(lot) <= 0) return "ESGOTADO";
  if (lot.salesStartAt && lot.salesStartAt > now) return "FUTURO";
  if (lot.salesEndAt && lot.salesEndAt <= now) return "ENCERRADO";
  return "ATIVO";
}

export function maskCpfLast4(last4?: string | null) {
  return last4 ? `***.***.***-${last4}` : "Nao informado";
}

export async function getAdminEventsDashboard() {
  const [events, paidOrders, pendingOrders, tickets, checkIns] = await Promise.all([
    prisma.ticketEvent.findMany({
      include: {
        lots: { orderBy: { position: "asc" } },
        _count: { select: { orders: true } },
      },
      orderBy: [{ startAt: "asc" }],
    }),
    prisma.eventOrder.aggregate({
      where: { status: "PAID" },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.eventOrder.count({ where: { status: "PENDING" } }),
    prisma.eventTicket.count(),
    prisma.eventTicket.count({ where: { status: "USED" } }),
  ]);

  return {
    kpis: {
      activeEvents: events.filter((event) => event.published && event.status !== "CANCELED" && event.status !== "FINISHED").length,
      ticketsSold: tickets,
      confirmedRevenue: paidOrders._sum.total ?? new Prisma.Decimal(0),
      checkIns,
      pendingOrders,
    },
    events: await Promise.all(events.map(async (event) => {
      const [paid, checkedIn] = await Promise.all([
        prisma.eventOrder.aggregate({
          where: { eventId: event.id, status: "PAID" },
          _sum: { total: true },
        }),
        prisma.eventTicket.count({ where: { eventId: event.id, status: "USED" } }),
      ]);
      const currentLot = event.lots.find((lot) => lotStatus(lot) === "ATIVO") ?? event.lots[0] ?? null;
      return {
        id: event.id,
        name: event.name,
        slug: event.slug,
        startAt: event.startAt,
        published: event.published,
        adminStatus: event.status,
        publicStatus: publicStatus(event),
        currentLotName: currentLot?.name ?? "Sem lote",
        sold: event.lots.reduce((total, lot) => total + lot.soldQuantity, 0),
        reserved: event.lots.reduce((total, lot) => total + lot.reservedQuantity, 0),
        revenue: paid._sum.total ?? new Prisma.Decimal(0),
        checkIns: checkedIn,
      };
    })),
  };
}

export async function getAdminEventCockpit(eventId: string) {
  const event = await prisma.ticketEvent.findUnique({
    where: { id: eventId },
    include: {
      lots: { orderBy: { position: "asc" } },
      partnerCodes: { orderBy: { createdAt: "desc" } },
      orders: {
        include: {
          partnerCode: true,
          participants: { include: { ticketLot: true, ticket: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      tickets: {
        include: {
          lot: true,
          eventOrder: { select: { id: true, partnerCode: true, buyerName: true } },
        },
        orderBy: [{ issuedAt: "desc" }],
        take: 50,
      },
    },
  });

  if (!event) return null;

  const [paid, pendingOrders, checkIns, paidOrdersCount] = await Promise.all([
    prisma.eventOrder.aggregate({
      where: { eventId, status: "PAID" },
      _sum: { total: true },
    }),
    prisma.eventOrder.count({ where: { eventId, status: "PENDING" } }),
    prisma.eventTicket.count({ where: { eventId, status: "USED" } }),
    prisma.eventOrder.count({ where: { eventId, status: "PAID" } }),
  ]);

  const issuedTickets = event.tickets.length;
  const totalIssuedTickets = await prisma.eventTicket.count({ where: { eventId } });
  const checkInRate = totalIssuedTickets === 0 ? 0 : Math.round((checkIns / totalIssuedTickets) * 100);

  return {
    event,
    kpis: {
      ticketsSold: totalIssuedTickets,
      confirmedRevenue: paid._sum.total ?? new Prisma.Decimal(0),
      pendingOrders,
      checkIns,
      checkInRate,
      paidOrdersCount,
    },
    lots: event.lots.map((lot) => ({
      ...lot,
      available: getTicketLotAvailability(lot),
      computedStatus: lotStatus(lot),
    })),
    orders: event.orders.map((order) => ({
      id: order.id,
      code: order.id.slice(0, 8).toUpperCase(),
      buyerName: order.buyerName,
      buyerEmail: order.buyerEmail,
      buyerPhone: order.buyerPhone,
      buyerCpfMasked: maskCpfLast4(order.buyerCpfLast4),
      status: order.status,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      total: order.total,
      partnerCode: order.partnerCode?.code ?? null,
      participantCount: order.participants.length,
      createdAt: order.createdAt,
      expiresAt: order.expiresAt,
      paidAt: order.paidAt,
      emailStatus: order.ticketConfirmationEmailStatus,
      emailSentAt: order.ticketConfirmationEmailSentAt,
      participants: order.participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        cpfMasked: maskCpfLast4(participant.cpfLast4),
        lotName: participant.ticketLot.name,
        ticketCode: participant.ticket?.ticketCode ?? null,
        ticketStatus: participant.ticket?.status ?? null,
        checkedInAt: participant.ticket?.checkedInAt ?? null,
      })),
    })),
    tickets: event.tickets.map((ticket) => ({
      id: ticket.id,
      ticketCode: ticket.ticketCode,
      participantName: ticket.participantName,
      participantCpfMasked: maskCpfLast4(ticket.participantCpfLast4),
      lotName: ticket.lot.name,
      orderCode: ticket.eventOrderId.slice(0, 8).toUpperCase(),
      buyerName: ticket.eventOrder.buyerName,
      status: ticket.status,
      checkedInAt: ticket.checkedInAt,
      partnerCode: ticket.eventOrder.partnerCode?.code ?? null,
    })),
    partnerCodes: await Promise.all(event.partnerCodes.map(async (code) => {
      const metrics = await prisma.eventOrder.aggregate({
        where: { eventId, partnerCodeId: code.id, status: "PAID" },
        _count: { _all: true },
        _sum: { total: true, discountAmount: true },
      });
      const ticketCount = await prisma.eventTicket.count({
        where: { eventId, eventOrder: { partnerCodeId: code.id, status: "PAID" } },
      });
      return {
        ...code,
        paidOrders: metrics._count._all,
        confirmedTickets: ticketCount,
        confirmedRevenue: metrics._sum.total ?? new Prisma.Decimal(0),
        confirmedDiscount: metrics._sum.discountAmount ?? new Prisma.Decimal(0),
      };
    })),
  };
}

export async function getAdminEventReport(eventId: string) {
  const event = await prisma.ticketEvent.findUnique({
    where: { id: eventId },
    include: {
      lots: { orderBy: { position: "asc" } },
      partnerCodes: { orderBy: { code: "asc" } },
    },
  });

  if (!event) return null;

  const [
    ordersByStatus,
    paidFinancials,
    paidTickets,
    ticketsByStatus,
    paidTicketsByLot,
    emailStatuses,
    paymentPreferenceStatuses,
    paymentErrorOrders,
    paymentEvents,
    checkInResults,
    checkInActions,
    checkInByOperator,
    recentCheckInIssues,
  ] = await Promise.all([
    prisma.eventOrder.groupBy({
      by: ["status"],
      where: { eventId },
      _count: { _all: true },
    }),
    prisma.eventOrder.aggregate({
      where: { eventId, status: "PAID" },
      _count: { _all: true },
      _sum: { subtotal: true, discountAmount: true, total: true },
    }),
    prisma.eventTicket.count({ where: { eventId, eventOrder: { status: "PAID" } } }),
    prisma.eventTicket.groupBy({
      by: ["status"],
      where: { eventId, eventOrder: { status: "PAID" } },
      _count: { _all: true },
    }),
    prisma.eventTicket.groupBy({
      by: ["lotId"],
      where: { eventId, eventOrder: { status: "PAID" } },
      _count: { _all: true },
    }),
    prisma.eventOrder.groupBy({
      by: ["ticketConfirmationEmailStatus"],
      where: { eventId },
      _count: { _all: true },
    }),
    prisma.eventOrder.groupBy({
      by: ["paymentPreferenceStatus"],
      where: { eventId },
      _count: { _all: true },
    }),
    prisma.eventOrder.count({
      where: {
        eventId,
        OR: [
          { paymentPreferenceStatus: "AMBIGUOUS" },
          { paymentPreferenceLastErrorAt: { not: null } },
          { status: { in: ["FAILED", "CANCELED", "EXPIRED", "REFUNDED"] } },
        ],
      },
    }),
    prisma.paymentEvent.groupBy({
      by: ["eventType", "status"],
      where: { eventOrder: { eventId } },
      _count: { _all: true },
    }),
    prisma.eventCheckInLog.groupBy({
      by: ["result"],
      where: { eventId },
      _count: { _all: true },
    }),
    prisma.eventCheckInLog.groupBy({
      by: ["action"],
      where: { eventId },
      _count: { _all: true },
    }),
    prisma.eventCheckInLog.groupBy({
      by: ["adminUserId"],
      where: { eventId, result: "CHECKED_IN" },
      _count: { _all: true },
    }),
    prisma.eventCheckInLog.findMany({
      where: {
        eventId,
        result: { in: ["ALREADY_USED", "INVALID", "WRONG_EVENT", "UNAUTHORIZED"] },
      },
      include: {
        adminUser: { select: { name: true, email: true } },
        ticket: { select: { ticketCode: true, participantName: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const lotTicketCount = new Map(paidTicketsByLot.map((row) => [row.lotId, row._count._all]));
  const operatorIds = checkInByOperator.map((row) => row.adminUserId).filter((id): id is string => Boolean(id));
  const operators = operatorIds.length
    ? await prisma.adminUser.findMany({
        where: { id: { in: operatorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const operatorById = new Map(operators.map((operator) => [operator.id, operator]));

  const partnerCodeRows = await Promise.all(event.partnerCodes.map(async (code) => {
    const [orders, tickets] = await Promise.all([
      prisma.eventOrder.aggregate({
        where: { eventId, partnerCodeId: code.id, status: "PAID" },
        _count: { _all: true },
        _sum: { total: true, discountAmount: true },
      }),
      prisma.eventTicket.count({
        where: { eventId, eventOrder: { partnerCodeId: code.id, status: "PAID" } },
      }),
    ]);

    return {
      code: code.code,
      partnerName: code.partnerName,
      active: code.active,
      paidOrders: orders._count._all,
      paidTickets: tickets,
      revenue: orders._sum.total ?? new Prisma.Decimal(0),
      discount: orders._sum.discountAmount ?? new Prisma.Decimal(0),
    };
  }));

  const checkIns = checkInResults.find((row) => row.result === "CHECKED_IN")?._count._all ?? 0;
  const alreadyUsed = checkInResults.find((row) => row.result === "ALREADY_USED")?._count._all ?? 0;
  const invalid = checkInResults.find((row) => row.result === "INVALID")?._count._all ?? 0;
  const wrongEvent = checkInResults.find((row) => row.result === "WRONG_EVENT")?._count._all ?? 0;
  const unauthorized = checkInResults.find((row) => row.result === "UNAUTHORIZED")?._count._all ?? 0;

  return {
    event: { id: event.id, name: event.name, startAt: event.startAt, venueName: event.venueName },
    sales: {
      paidOrders: paidFinancials._count._all,
      paidTickets,
      subtotal: paidFinancials._sum.subtotal ?? new Prisma.Decimal(0),
      discount: paidFinancials._sum.discountAmount ?? new Prisma.Decimal(0),
      revenue: paidFinancials._sum.total ?? new Prisma.Decimal(0),
      ordersByStatus: ordersByStatus.map((row) => ({ status: row.status, count: row._count._all })),
      ticketsByStatus: ticketsByStatus.map((row) => ({ status: row.status, count: row._count._all })),
    },
    lots: event.lots.map((lot) => ({
      id: lot.id,
      name: lot.name,
      price: lot.price,
      quantity: lot.quantity,
      soldQuantity: lot.soldQuantity,
      reservedQuantity: lot.reservedQuantity,
      paidTickets: lotTicketCount.get(lot.id) ?? 0,
      available: getTicketLotAvailability(lot),
      status: lotStatus(lot),
    })),
    partnerCodes: partnerCodeRows.sort((left, right) => right.paidTickets - left.paidTickets || left.code.localeCompare(right.code)),
    email: emailStatuses.map((row) => ({ status: row.ticketConfirmationEmailStatus, count: row._count._all })),
    payments: {
      preferenceStatuses: paymentPreferenceStatuses.map((row) => ({ status: row.paymentPreferenceStatus, count: row._count._all })),
      issueOrders: paymentErrorOrders,
      events: paymentEvents.map((row) => ({
        eventType: row.eventType,
        status: row.status ?? "-",
        count: row._count._all,
      })),
    },
    checkIn: {
      total: checkIns,
      rate: paidTickets === 0 ? 0 : Math.round((checkIns / paidTickets) * 100),
      pending: Math.max(paidTickets - checkIns, 0),
      alreadyUsed,
      invalid,
      wrongEvent,
      unauthorized,
      results: checkInResults.map((row) => ({ result: row.result, count: row._count._all })),
      actions: checkInActions.map((row) => ({ action: row.action, count: row._count._all })),
      operators: checkInByOperator
        .map((row) => {
          const operator = row.adminUserId ? operatorById.get(row.adminUserId) : null;
          return {
            adminUserId: row.adminUserId,
            name: operator?.name ?? "Operador nao identificado",
            email: operator?.email ?? null,
            checkIns: row._count._all,
          };
        })
        .sort((left, right) => right.checkIns - left.checkIns),
      recentIssues: recentCheckInIssues.map((log) => ({
        id: log.id,
        createdAt: log.createdAt,
        result: log.result,
        action: log.action,
        operatorName: log.adminUser?.name ?? "Operador nao identificado",
        ticketCode: log.ticket?.ticketCode ?? "-",
        participantName: log.ticket?.participantName ?? "-",
        ticketStatus: log.ticket?.status ?? "-",
      })),
    },
  };
}

export async function createTicketEventAdmin(input: TicketEventAdminInput, actor: EventAdminActor) {
  assertSuperAdmin(actor);
  const parsed = eventInputSchema.parse(input);
  assertDateRange(parsed);
  const slug = normalizeEventSlug(parsed.slug || parsed.name);
  if (!slug) throw new EventAdminValidationError("Informe um slug valido.");

  const existing = await prisma.ticketEvent.findUnique({ where: { slug }, select: { id: true } });
  if (existing) throw new EventAdminValidationError("Ja existe um evento com esse slug.");

  const event = await prisma.ticketEvent.create({
    data: {
      ...parsed,
      bannerImage: normalizeEventImagePath(parsed.bannerImage),
      coverImage: normalizeEventImagePath(parsed.coverImage),
      slug,
      status: parsed.published ? "PUBLISHED" : "DRAFT",
    },
  });
  await audit({ actor, eventId: event.id, action: "EVENT_CREATED", targetType: "TicketEvent", targetId: event.id, metadata: { slug } });
  return event;
}

export async function updateTicketEventAdmin(eventId: string, input: TicketEventAdminInput, actor: EventAdminActor) {
  assertSuperAdmin(actor);
  const parsed = eventInputSchema.parse(input);
  assertDateRange(parsed);
  const slug = normalizeEventSlug(parsed.slug || parsed.name);
  if (!slug) throw new EventAdminValidationError("Informe um slug valido.");

  const existing = await prisma.ticketEvent.findUnique({ where: { slug }, select: { id: true } });
  if (existing && existing.id !== eventId) throw new EventAdminValidationError("Ja existe um evento com esse slug.");

  const event = await prisma.ticketEvent.update({
    where: { id: eventId },
    data: {
      ...parsed,
      bannerImage: normalizeEventImagePath(parsed.bannerImage),
      coverImage: normalizeEventImagePath(parsed.coverImage),
      slug,
      status: parsed.published ? "PUBLISHED" : "DRAFT",
    },
  });
  await audit({ actor, eventId, action: "EVENT_UPDATED", targetType: "TicketEvent", targetId: eventId, metadata: { slug } });
  return event;
}

export async function publishTicketEventAdmin(eventId: string, actor: EventAdminActor) {
  assertSuperAdmin(actor);
  const event = await prisma.ticketEvent.findUnique({ where: { id: eventId }, include: { lots: true } });
  if (!event) throw new EventAdminValidationError("Evento nao encontrado.");
  if (!event.name || !event.slug || !event.startAt || !event.venueName) {
    throw new EventAdminValidationError("Complete informacoes, data e local antes de publicar.");
  }
  assertDateRange(event);
  if (event.lots.length === 0) {
    throw new EventAdminValidationError("Configure pelo menos um lote antes de publicar.");
  }

  const updated = await prisma.ticketEvent.update({
    where: { id: eventId },
    data: { published: true, status: "PUBLISHED" },
  });
  await audit({ actor, eventId, action: "EVENT_PUBLISHED", targetType: "TicketEvent", targetId: eventId });
  return updated;
}

export async function unpublishTicketEventAdmin(eventId: string, actor: EventAdminActor) {
  assertSuperAdmin(actor);
  const updated = await prisma.ticketEvent.update({
    where: { id: eventId },
    data: { published: false, status: "DRAFT" },
  });
  await audit({ actor, eventId, action: "EVENT_UNPUBLISHED", targetType: "TicketEvent", targetId: eventId });
  return updated;
}

export async function cancelTicketEventAdmin(eventId: string, actor: EventAdminActor) {
  assertSuperAdmin(actor);
  const updated = await prisma.ticketEvent.update({
    where: { id: eventId },
    data: { status: "CANCELED", published: true },
  });
  await audit({ actor, eventId, action: "EVENT_CANCELED", targetType: "TicketEvent", targetId: eventId });
  return updated;
}

export async function createTicketLotAdmin(eventId: string, input: EventTicketLotAdminInput, actor: EventAdminActor) {
  assertSuperAdmin(actor);
  const parsed = lotInputSchema.parse(input);
  assertPaidLotSupported(parsed.price);
  assertLotDates(parsed);
  const duplicate = await prisma.eventTicketLot.findFirst({ where: { eventId, position: parsed.position }, select: { id: true } });
  if (duplicate) throw new EventAdminValidationError("Ja existe um lote nesta posicao.");

  const lot = await prisma.eventTicketLot.create({ data: { ...parsed, eventId } });
  await audit({ actor, eventId, action: "LOT_CREATED", targetType: "EventTicketLot", targetId: lot.id, metadata: { position: lot.position } });
  return lot;
}

export async function updateTicketLotAdmin(lotId: string, input: EventTicketLotAdminInput, actor: EventAdminActor) {
  assertSuperAdmin(actor);
  const parsed = lotInputSchema.parse(input);
  assertPaidLotSupported(parsed.price);
  assertLotDates(parsed);
  const current = await prisma.eventTicketLot.findUnique({ where: { id: lotId } });
  if (!current) throw new EventAdminValidationError("Lote nao encontrado.");
  if (parsed.quantity < current.soldQuantity + current.reservedQuantity) {
    throw new EventAdminValidationError("Este lote possui ingressos vendidos ou reservados acima da nova capacidade informada.");
  }
  const duplicate = await prisma.eventTicketLot.findFirst({
    where: { eventId: current.eventId, position: parsed.position, NOT: { id: lotId } },
    select: { id: true },
  });
  if (duplicate) throw new EventAdminValidationError("Ja existe um lote nesta posicao.");

  const lot = await prisma.eventTicketLot.update({ where: { id: lotId }, data: parsed });
  await audit({ actor, eventId: current.eventId, action: "LOT_UPDATED", targetType: "EventTicketLot", targetId: lot.id, metadata: { position: lot.position } });
  return lot;
}

export async function createPartnerCodeAdmin(eventId: string, input: EventPartnerCodeAdminInput, actor: EventAdminActor) {
  assertSuperAdmin(actor);
  const parsed = partnerCodeInputSchema.parse(input);
  assertPartnerDates(parsed);
  const code = normalizePartnerCodeAdmin(parsed.code);
  if (parsed.discountType === "PERCENTAGE" && (parsed.discountValue.lessThanOrEqualTo(0) || parsed.discountValue.greaterThan(100))) {
    throw new EventAdminValidationError("Percentual precisa ser maior que 0 e no maximo 100.");
  }
  if (parsed.discountType === "FIXED" && parsed.discountValue.lessThanOrEqualTo(0)) {
    throw new EventAdminValidationError("Desconto fixo precisa ser maior que zero.");
  }

  const partnerCode = await prisma.eventPartnerCode.create({ data: { ...parsed, code, eventId } });
  await audit({ actor, eventId, action: "PARTNER_CODE_CREATED", targetType: "EventPartnerCode", targetId: partnerCode.id, metadata: { code } });
  return partnerCode;
}

export async function updatePartnerCodeAdmin(codeId: string, input: EventPartnerCodeAdminInput, actor: EventAdminActor) {
  assertSuperAdmin(actor);
  const parsed = partnerCodeInputSchema.parse(input);
  assertPartnerDates(parsed);
  const current = await prisma.eventPartnerCode.findUnique({ where: { id: codeId } });
  if (!current) throw new EventAdminValidationError("Codigo nao encontrado.");
  const code = normalizePartnerCodeAdmin(parsed.code);
  if (parsed.discountType === "PERCENTAGE" && (parsed.discountValue.lessThanOrEqualTo(0) || parsed.discountValue.greaterThan(100))) {
    throw new EventAdminValidationError("Percentual precisa ser maior que 0 e no maximo 100.");
  }
  if (parsed.discountType === "FIXED" && parsed.discountValue.lessThanOrEqualTo(0)) {
    throw new EventAdminValidationError("Desconto fixo precisa ser maior que zero.");
  }

  const partnerCode = await prisma.eventPartnerCode.update({ where: { id: codeId }, data: { ...parsed, code } });
  await audit({ actor, eventId: current.eventId, action: "PARTNER_CODE_UPDATED", targetType: "EventPartnerCode", targetId: codeId, metadata: { code } });
  return partnerCode;
}

export async function resendTicketConfirmationEmailAdmin(input: {
  eventOrderId: string;
  confirmAmbiguous?: boolean;
  actor: EventAdminActor;
  sender?: EventTicketEmailSender;
  from?: string;
  baseUrl?: string;
}) {
  assertSuperAdmin(input.actor);
  const order = await prisma.eventOrder.findUnique({
    where: { id: input.eventOrderId },
    include: { tickets: true, participants: true },
  });
  if (!order || order.status !== "PAID" || order.tickets.length === 0 || order.tickets.length !== order.participants.length) {
    throw new EventAdminValidationError("Reenvio permitido somente para pedido pago com ingressos emitidos.");
  }
  if (order.ticketConfirmationEmailStatus === "SENT" || order.ticketConfirmationEmailStatus === "SENDING") {
    throw new EventAdminValidationError("Este pedido nao esta elegivel para reenvio agora.");
  }
  if (order.ticketConfirmationEmailStatus === "AMBIGUOUS" && !input.confirmAmbiguous) {
    throw new EventAdminValidationError("Confirme o reenvio de um e-mail com estado incerto.");
  }

  await audit({
    actor: input.actor,
    eventId: order.eventId,
    action: "EMAIL_RESEND_REQUESTED",
    targetType: "EventOrder",
    targetId: order.id,
    metadata: { previousStatus: order.ticketConfirmationEmailStatus },
  });
  await prisma.eventOrder.update({
    where: { id: order.id },
    data: {
      ticketConfirmationEmailStatus: "NOT_SENT",
      ticketConfirmationEmailStartedAt: null,
      ticketConfirmationEmailLastErrorAt: null,
    },
  });
  const result = await ensureEventTicketConfirmationEmail(order.id, {
    sender: input.sender,
    from: input.from,
    baseUrl: input.baseUrl,
  });
  if (result.reason === "smtp_ambiguous") throw new AmbiguousEventTicketEmailError();
  return result;
}

export function formatAdminMoney(value: Prisma.Decimal | number | string) {
  return formatMoney(value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value));
}

export function parseAdminDecimal(value: string | null | undefined) {
  return new Prisma.Decimal((value || "0").replace(",", "."));
}

export function buildCpfHashSearch(value: string | null | undefined) {
  const digits = onlyDigits(value ?? "");
  return digits.length === 11 ? cpfHash(digits) : null;
}
