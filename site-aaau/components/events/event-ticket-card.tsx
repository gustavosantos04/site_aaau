import { CalendarDays, Clock, MapPin, Ticket } from "lucide-react";
import type { EventTicketStatus } from "@prisma/client";

import { Badge } from "@/components/shared/badge";
import { formatEventDate, formatEventDateTime, formatEventTime } from "@/lib/events/public";
import {
  eventTicketStatusLabel,
  eventTicketStatusTone,
  renderEventTicketQrSvg,
} from "@/lib/events/ticket-display";

type EventTicketCardProps = {
  ticket: {
    ticketCode: string;
    qrToken: string;
    participantName: string;
    status: EventTicketStatus;
    checkedInAt: Date | null;
    lot: { name: string };
  };
  event: {
    name: string;
    startAt: Date;
    venueName: string;
    venueAddress: string | null;
  };
  index: number;
  total: number;
};

export async function EventTicketCard({ ticket, event, index, total }: EventTicketCardProps) {
  const qrSvg = await renderEventTicketQrSvg(ticket.qrToken);
  const used = ticket.status === "USED";

  return (
    <article className="overflow-hidden rounded-[0.5rem] border border-white/10 bg-[#111]/90 shadow-glow">
      {used ? (
        <div className="bg-white/12 px-4 py-2 text-center text-xs font-semibold uppercase tracking-[0.18em] text-white">
          Ingresso já utilizado
        </div>
      ) : null}
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr,18rem] lg:items-center">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={eventTicketStatusTone(ticket.status)}>
              {eventTicketStatusLabel(ticket.status)}
            </Badge>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
              Ingresso {index + 1} de {total}
            </span>
          </div>

          <div>
            <h2 className="break-words font-display text-3xl uppercase tracking-[0.06em] text-white sm:text-4xl">
              {event.name}
            </h2>
            <p className="mt-2 break-words text-lg font-semibold text-aaau-sand">
              {ticket.participantName}
            </p>
          </div>

          <dl className="grid gap-3 text-sm text-white/72 sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0 text-aaau-sand" />
              <span>{formatEventDate(event.startAt)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-aaau-sand" />
              <span>{formatEventTime(event.startAt)}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-aaau-sand" />
              <span>{event.venueAddress || event.venueName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Ticket className="h-4 w-4 shrink-0 text-aaau-sand" />
              <span>{ticket.lot.name}</span>
            </div>
          </dl>

          <div className="rounded-[0.5rem] border border-white/10 bg-aaau-night/55 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Código do ingresso</p>
            <p className="mt-2 break-words font-display text-3xl uppercase tracking-[0.08em] text-white">
              {ticket.ticketCode}
            </p>
            {used && ticket.checkedInAt ? (
              <p className="mt-2 text-sm text-white/60">
                Entrada registrada em {formatEventDateTime(ticket.checkedInAt)}.
              </p>
            ) : null}
          </div>
        </div>

        <div className={used ? "opacity-45" : undefined}>
          <div className="mx-auto max-w-[18rem] rounded-[0.5rem] bg-white p-4">
            <div
              className="[&_svg]:h-auto [&_svg]:w-full"
              role="img"
              aria-label={`QR Code do ingresso ${ticket.ticketCode}`}
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          </div>
          <p className="mt-3 text-center text-xs leading-6 text-white/55">
            Não compartilhe seu QR Code com terceiros.
          </p>
        </div>
      </div>
    </article>
  );
}
