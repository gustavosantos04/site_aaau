import { CalendarDays, MapPin, Ticket } from "lucide-react";
import { randomUUID } from "node:crypto";

import { CopyTicketCodeButton, PendingTransferControls, PortalTransferForm } from "@/components/events/portal-controls";
import { Badge } from "@/components/shared/badge";
import { formatEventDate, formatEventDateTime } from "@/lib/events/public";
import type { EventTicketPortalGroup, EventTicketPortalTicket } from "@/lib/events/portal-access";
import { renderEventTicketQrSvg } from "@/lib/events/ticket-display";

const labels = {
  ACTIVE: "Ativo", USED: "Utilizado", PENDING_TRANSFER: "Transferência pendente",
  TRANSFERRED: "Transferido", CANCELED: "Cancelado", REFUNDED: "Reembolsado",
} as const;

export async function PortalTicketCard({ ticket, event }: {
  ticket: EventTicketPortalTicket;
  event: EventTicketPortalGroup["event"];
}) {
  if (ticket.state === "TRANSFERRED") {
    return (
      <article className="rounded-[0.55rem] border border-white/10 bg-white/[0.04] p-5">
        <Badge>Transferido</Badge>
        <h3 className="mt-4 font-display text-3xl uppercase tracking-[0.06em] text-white">Ingresso transferido</h3>
        <p className="mt-2 text-sm text-white/65">Este ingresso não está mais disponível para este acesso.</p>
        <p className="mt-2 text-xs text-white/45">Data da transferência: {formatEventDateTime(ticket.transferredAt)}</p>
      </article>
    );
  }
  const qrSvg = ticket.qrToken ? await renderEventTicketQrSvg(ticket.qrToken) : null;
  return (
    <article className="rounded-[0.55rem] border border-white/10 bg-white/[0.04] p-5 sm:p-6">
      <Badge>{labels[ticket.state]}</Badge>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr,15rem]">
        <div>
          <h3 className="font-display text-3xl uppercase tracking-[0.05em] text-white">{ticket.participantName}</h3>
          <div className="mt-4 space-y-2 text-sm text-white/65">
            <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-aaau-sand" />{formatEventDate(event.startAt)}</p>
            <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-aaau-sand" />{event.venueAddress || event.venueName}</p>
            <p className="flex items-center gap-2"><Ticket className="h-4 w-4 text-aaau-sand" />{ticket.lotName}</p>
          </div>
          {ticket.ticketCode ? <div className="mt-5 rounded-[0.4rem] border border-white/10 bg-aaau-night/60 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-white/45">Código manual</p>
            <p className="my-2 break-all font-display text-3xl tracking-[0.08em] text-white">{ticket.ticketCode}</p>
            <CopyTicketCodeButton code={ticket.ticketCode} />
          </div> : null}
          {ticket.state === "USED" && ticket.checkedInAt ? <p className="mt-4 text-sm text-white/60">Entrada registrada em {formatEventDateTime(ticket.checkedInAt)}.</p> : null}
          {ticket.pendingTransfer ? <div className="mt-5 rounded-[0.4rem] border border-aaau-sand/25 bg-aaau-sand/10 p-4 text-sm text-white/70">
            <p>Etapa: {ticket.pendingTransfer.stage}</p>
            <p>Destinatário: {ticket.pendingTransfer.recipientEmailMasked}</p>
            <p>Expira em: {formatEventDateTime(ticket.pendingTransfer.expiresAt)}</p>
            <PendingTransferControls ticketId={ticket.ticketId} />
          </div> : null}
          {ticket.canTransfer ? <PortalTransferForm
            ticketId={ticket.ticketId}
            requestId={randomUUID()}
            event={{
              startAt: event.startAt.toISOString(),
              minimumAge: event.minimumAge,
              requireParticipantPhone: event.requireParticipantPhone,
              requireInstitution: event.requireInstitution,
              requireCourse: event.requireCourse,
              requireCampus: event.requireCampus,
            }}
          /> : null}
          {ticket.transferLimitReached ? <div className="mt-5 rounded-[0.4rem] border border-aaau-sand/25 bg-aaau-sand/10 p-4">
            <h4 className="font-display text-xl uppercase tracking-[0.06em] text-aaau-sand">Transferência já utilizada</h4>
            <p className="mt-2 text-sm text-white/70">Este ingresso já foi transferido anteriormente e não pode ser transferido novamente.</p>
          </div> : null}
          {ticket.state === "CANCELED" ? <p className="mt-4 text-sm text-white/60">Este ingresso foi cancelado e não pode ser transferido.</p> : null}
          {ticket.state === "REFUNDED" ? <p className="mt-4 text-sm text-white/60">Este ingresso foi reembolsado e não pode ser transferido.</p> : null}
        </div>
        {qrSvg ? <div>
          <div role="img" aria-label="QR Code do ingresso" className="mx-auto max-w-[15rem] rounded-[0.45rem] bg-white p-3 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <p className="mt-2 text-center text-xs text-white/45">Não compartilhe este QR Code.</p>
        </div> : null}
      </div>
    </article>
  );
}
