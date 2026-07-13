import type { EventTicketStatus, Prisma } from "@prisma/client";

import type { AdminActor } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { confirmEventTicketCheckIn, validateEventTicketForCheckIn } from "@/lib/events/check-in";
import { maskCpfLast4 } from "@/lib/events/admin";
import type { CheckInSource, CheckInValidationStatus } from "@/lib/events/types";
import { isEventTicketQrToken } from "@/lib/portaria-qr";
import {
  buildCpfHashForPortariaSearch,
  normalizeNameSearch,
  normalizeTicketCodeSearch,
} from "@/lib/portaria-search";
import { hashPassword } from "@/lib/password";
export { parseEventTicketQrPayload } from "@/lib/portaria-qr";

export type PortariaStatus =
  | CheckInValidationStatus
  | "CHECKED_IN"
  | "UNAUTHORIZED"
  | "AUTH_REQUIRED";

export class PortariaAuthError extends Error {
  constructor(message = "Acesso nao autorizado.") {
    super(message);
  }
}

export async function assertPortariaEventAccess(actor: AdminActor, eventId: string) {
  if (actor.role === "super_admin") {
    return { ...actor, active: true };
  }

  if (!actor.adminUserId) {
    throw new PortariaAuthError();
  }

  const adminUser = await prisma.adminUser.findUnique({
    where: { id: actor.adminUserId },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      eventAssignments: {
        where: { eventId, active: true },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!adminUser?.isActive || adminUser.role !== "event_staff" || adminUser.eventAssignments.length === 0) {
    throw new PortariaAuthError();
  }

  return { ...actor, active: true };
}

function operationalStatus(event: { status: string; startAt: Date; endAt: Date | null }) {
  const now = new Date();
  if (event.status === "CANCELED") return "Cancelado";
  if (event.endAt && event.endAt < now) return "Encerrado";
  if (event.startAt <= now && (!event.endAt || event.endAt >= now)) return "Acontecendo agora";
  if (event.startAt > now) return "Próximo";
  return "Consulta";
}

function sortScore(event: { startAt: Date; endAt: Date | null }) {
  const now = Date.now();
  const started = event.startAt.getTime() <= now;
  const notEnded = !event.endAt || event.endAt.getTime() >= now;
  if (started && notEnded) return 0;
  if (event.startAt.getTime() > now) return 1;
  return 2;
}

export async function getPortariaEvents(actor: AdminActor) {
  const where =
    actor.role === "super_admin"
      ? { published: true, status: { not: "DRAFT" as const } }
      : {
          published: true,
          status: { not: "DRAFT" as const },
          staffAssignments: {
            some: {
              adminUserId: actor.adminUserId ?? "",
              active: true,
              adminUser: { isActive: true, role: "event_staff" },
            },
          },
        };

  const events = await prisma.ticketEvent.findMany({
    where,
    include: { _count: { select: { tickets: true } } },
    orderBy: [{ startAt: "asc" }],
  });

  const rows = await Promise.all(
    events.map(async (event) => {
      const checkIns = await prisma.eventTicket.count({ where: { eventId: event.id, status: "USED" } });
      return {
        id: event.id,
        name: event.name,
        startAt: event.startAt,
        venueName: event.venueName,
        status: operationalStatus(event),
        issuedTickets: event._count.tickets,
        checkIns,
        sortScore: sortScore(event),
      };
    }),
  );

  return rows.sort((a, b) => a.sortScore - b.sortScore || a.startAt.getTime() - b.startAt.getTime());
}

export async function getPortariaEventDashboard(actor: AdminActor, eventId: string) {
  await assertPortariaEventAccess(actor, eventId);
  const event = await prisma.ticketEvent.findUnique({ where: { id: eventId } });
  if (!event) return null;

  const [issuedTickets, checkIns, recentEntries] = await Promise.all([
    prisma.eventTicket.count({ where: { eventId, eventOrder: { status: "PAID" } } }),
    prisma.eventTicket.count({ where: { eventId, status: "USED", eventOrder: { status: "PAID" } } }),
    getLatestPortariaEntries(actor, eventId, 10),
  ]);
  const pending = Math.max(issuedTickets - checkIns, 0);

  return {
    event: {
      id: event.id,
      name: event.name,
      startAt: event.startAt,
      venueName: event.venueName,
      status: operationalStatus(event),
    },
    metrics: {
      issuedTickets,
      checkIns,
      pending,
      entryRate: issuedTickets === 0 ? 0 : Math.round((checkIns / issuedTickets) * 100),
    },
    recentEntries,
  };
}

function ticketDto(ticket: {
  participantName: string;
  participantCpfLast4: string | null;
  ticketCode: string;
  status: EventTicketStatus;
  checkedInAt: Date | null;
  lot: { name: string };
  event: { name: string };
}) {
  return {
    participantName: ticket.participantName,
    participantCpfMasked: maskCpfLast4(ticket.participantCpfLast4),
    ticketCode: ticket.ticketCode,
    lotName: ticket.lot.name,
    eventName: ticket.event.name,
    ticketStatus: ticket.status,
    checkedInAt: ticket.checkedInAt,
  };
}

async function getOperationalAdminUserId(actor: AdminActor) {
  if (actor.adminUserId) return actor.adminUserId;
  if (actor.role !== "super_admin") throw new PortariaAuthError();

  const user = await prisma.adminUser.upsert({
    where: { email: actor.email },
    create: {
      name: "Super admin",
      email: actor.email,
      passwordHash: "env_managed_auth",
      role: "super_admin",
      isActive: true,
    },
    update: {},
    select: { id: true, isActive: true, role: true },
  });

  if (!user.isActive || user.role !== "super_admin") {
    throw new PortariaAuthError();
  }

  return user.id;
}

async function findTicketByQrToken(qrToken: string) {
  return prisma.eventTicket.findUnique({
    where: { qrToken },
    include: { lot: true, event: true, eventOrder: true },
  });
}

export async function validatePortariaQrTicketDto(actor: AdminActor, eventId: string, qrToken: string) {
  await assertPortariaEventAccess(actor, eventId);
  if (!isEventTicketQrToken(qrToken)) return { status: "INVALID" as const, ticket: null };

  const validation = await validateEventTicketForCheckIn(eventId, qrToken);
  const ticket = await findTicketByQrToken(qrToken);
  if (!validation.ticket || !ticket) return { status: "INVALID" as const, ticket: null };

  if (validation.status === "WRONG_EVENT") {
    return { status: "WRONG_EVENT" as const, ticket: null };
  }

  return {
    status: validation.status,
    ticket: ticketDto(ticket),
  };
}

export async function confirmPortariaQrTicket(actor: AdminActor, eventId: string, qrToken: string) {
  const authorized = await assertPortariaEventAccess(actor, eventId);
  const adminUserId = await getOperationalAdminUserId(authorized);
  if (!isEventTicketQrToken(qrToken)) return { status: "INVALID" as const, ticket: null };

  try {
    await confirmEventTicketCheckIn({
      eventId,
      qrToken,
      adminUserId,
      source: "QR",
    });
  } catch {
    const validation = await validatePortariaQrTicketDto(actor, eventId, qrToken);
    return validation;
  }

  const ticket = await findTicketByQrToken(qrToken);
  return {
    status: "CHECKED_IN" as const,
    ticket: ticket ? ticketDto(ticket) : null,
  };
}

export async function searchPortariaTickets(actor: AdminActor, eventId: string, query: string) {
  await assertPortariaEventAccess(actor, eventId);
  const normalizedName = normalizeNameSearch(query);
  const ticketCode = normalizeTicketCodeSearch(query);
  const cpfHashValue = buildCpfHashForPortariaSearch(query);

  if (normalizedName.length < 3 && ticketCode.length < 4 && !cpfHashValue) {
    return [];
  }
  const clauses: Prisma.EventTicketWhereInput[] = [];
  if (normalizedName.length >= 3) {
    clauses.push({ participantName: { contains: normalizedName, mode: "insensitive" } });
  }
  if (ticketCode.length >= 4) {
    clauses.push({ ticketCode: { contains: ticketCode, mode: "insensitive" } });
  }
  if (cpfHashValue) {
    clauses.push({ participantCpfHash: cpfHashValue });
  }

  const tickets = await prisma.eventTicket.findMany({
    where: {
      eventId,
      eventOrder: { status: "PAID" },
      OR: clauses,
    },
    include: { lot: true, event: true },
    orderBy: [{ participantName: "asc" }],
    take: 20,
  });

  return tickets.map((ticket) => ticketDto(ticket));
}

export async function validatePortariaManualTicket(actor: AdminActor, eventId: string, ticketCode: string) {
  await assertPortariaEventAccess(actor, eventId);
  const ticket = await prisma.eventTicket.findFirst({
    where: { eventId, ticketCode: normalizeTicketCodeSearch(ticketCode), eventOrder: { status: "PAID" } },
    include: { lot: true, event: true },
  });
  if (!ticket) return { status: "INVALID" as const, ticket: null };
  return {
    status:
      ticket.status === "USED" || ticket.checkedInAt
        ? "ALREADY_USED"
        : ticket.status === "VALID"
          ? "VALID"
          : ticket.status,
    ticket: ticketDto(ticket),
  };
}

export async function confirmPortariaManualTicket(actor: AdminActor, eventId: string, ticketCode: string) {
  const authorized = await assertPortariaEventAccess(actor, eventId);
  await getOperationalAdminUserId(authorized);

  const ticket = await prisma.eventTicket.findFirst({
    where: { eventId, ticketCode: normalizeTicketCodeSearch(ticketCode), eventOrder: { status: "PAID" } },
    select: { qrToken: true },
  });
  if (!ticket) return { status: "INVALID" as const, ticket: null };

  return confirmBySource(actor, eventId, ticket.qrToken, "MANUAL");
}

async function confirmBySource(actor: AdminActor, eventId: string, qrToken: string, source: CheckInSource) {
  const authorized = await assertPortariaEventAccess(actor, eventId);
  const adminUserId = await getOperationalAdminUserId(authorized);

  try {
    await confirmEventTicketCheckIn({ eventId, qrToken, adminUserId, source });
  } catch {
    return validatePortariaQrTicketDto(actor, eventId, qrToken);
  }

  const ticket = await findTicketByQrToken(qrToken);
  return { status: "CHECKED_IN" as const, ticket: ticket ? ticketDto(ticket) : null };
}

export async function getLatestPortariaEntries(actor: AdminActor, eventId: string, take = 10) {
  await assertPortariaEventAccess(actor, eventId);
  const logs = await prisma.eventCheckInLog.findMany({
    where: { eventId, result: "CHECKED_IN", ticketId: { not: null } },
    include: {
      ticket: { select: { participantName: true, ticketCode: true } },
      adminUser: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });

  return logs.map((log) => ({
    checkedInAt: log.createdAt,
    participantName: log.ticket?.participantName ?? "Participante",
    ticketCode: log.ticket?.ticketCode ?? "-",
    operatorName: log.adminUser?.name ?? "Super admin",
  }));
}

export async function getEventStaffAdmin(eventId: string) {
  const [assignments, staffUsers] = await Promise.all([
    prisma.eventStaffAssignment.findMany({
      where: { eventId },
      include: { adminUser: { select: { id: true, name: true, email: true, role: true, isActive: true } } },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    }),
    prisma.adminUser.findMany({
      where: { role: "event_staff" },
      select: { id: true, name: true, email: true, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return { assignments, staffUsers };
}

async function auditStaff(input: {
  actor: AdminActor;
  eventId: string;
  action: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await prisma.eventAdminAuditLog.create({
    data: {
      eventId: input.eventId,
      adminUserId: input.actor.adminUserId,
      action: input.action,
      targetType: "EventStaffAssignment",
      targetId: input.targetId ?? null,
      metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
    },
  });
}

export async function createEventStaffUser(input: {
  actor: AdminActor;
  eventId: string;
  name: string;
  email: string;
  password: string;
  active: boolean;
}) {
  if (input.actor.role !== "super_admin") throw new PortariaAuthError();
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (name.length < 2) throw new Error("Informe o nome do staff.");
  if (!email.includes("@")) throw new Error("Informe um e-mail valido.");
  if (input.password.length < 8) throw new Error("A senha inicial precisa ter pelo menos 8 caracteres.");
  const user = await prisma.adminUser.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(input.password),
      role: "event_staff",
      isActive: input.active,
    },
  });
  await auditStaff({
    actor: input.actor,
    eventId: input.eventId,
    action: "STAFF_CREATED",
    targetId: user.id,
    metadata: { email },
  });
  return user;
}

export async function assignEventStaff(input: { actor: AdminActor; eventId: string; adminUserId: string }) {
  if (input.actor.role !== "super_admin") throw new PortariaAuthError();
  const user = await prisma.adminUser.findUnique({ where: { id: input.adminUserId } });
  if (!user || user.role !== "event_staff") throw new Error("Selecione um usuario event_staff.");

  const assignment = await prisma.eventStaffAssignment.upsert({
    where: { eventId_adminUserId: { eventId: input.eventId, adminUserId: input.adminUserId } },
    create: {
      eventId: input.eventId,
      adminUserId: input.adminUserId,
      active: true,
      createdByAdminUserId: input.actor.adminUserId,
    },
    update: { active: true },
  });
  await auditStaff({ actor: input.actor, eventId: input.eventId, action: "STAFF_ASSIGNED", targetId: assignment.id });
  return assignment;
}

export async function setEventStaffAssignmentActive(input: {
  actor: AdminActor;
  eventId: string;
  assignmentId: string;
  active: boolean;
}) {
  if (input.actor.role !== "super_admin") throw new PortariaAuthError();
  const changed = await prisma.eventStaffAssignment.updateMany({
    where: { id: input.assignmentId, eventId: input.eventId },
    data: { active: input.active },
  });
  if (changed.count !== 1) throw new PortariaAuthError();
  await auditStaff({
    actor: input.actor,
    eventId: input.eventId,
    action: input.active ? "STAFF_ACTIVATED" : "STAFF_UNASSIGNED",
    targetId: input.assignmentId,
  });
  return { id: input.assignmentId, active: input.active };
}
