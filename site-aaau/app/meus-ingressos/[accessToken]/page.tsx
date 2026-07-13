import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck, Ticket } from "lucide-react";

import { EventTicketCard } from "@/components/events/event-ticket-card";
import { Badge } from "@/components/shared/badge";
import { buttonVariants } from "@/components/shared/button";
import { eventOrderTicketsReady, getEventTicketsByAccessToken } from "@/lib/events/ticket-access";
import { formatEventDate } from "@/lib/events/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Meus ingressos | AAAU",
  robots: { index: false, follow: false },
};

export default async function MyEventTicketsPage({
  params,
}: {
  params: Promise<{ accessToken: string }>;
}) {
  const { accessToken } = await params;
  const order = await getEventTicketsByAccessToken(accessToken);

  if (!order) {
    notFound();
  }

  const ticketsReady = eventOrderTicketsReady(order);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <section className="rounded-[0.5rem] border border-white/10 bg-white/[0.04] p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-3">
          <Badge className={ticketsReady ? "border-aaau-sand/40 bg-aaau-sand/15 text-aaau-sand" : undefined}>
            {ticketsReady ? "Ingressos confirmados" : "Pagamento em verificação"}
          </Badge>
          <span className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-white/45 sm:inline">
            Pedido oficial AAAU
          </span>
        </div>
        <div className="mt-5 grid gap-6 lg:grid-cols-[1fr,20rem] lg:items-end">
          <div>
            <h1 className="break-words font-display text-4xl uppercase tracking-[0.06em] text-white sm:text-6xl sm:tracking-[0.08em]">
              {order.event.name}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/68">
              Na entrada, abra o ingresso de cada participante e apresente o QR Code com o brilho da tela alto.
            </p>
          </div>
          <div className="rounded-[0.5rem] border border-white/10 bg-aaau-night/50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <Ticket className="h-4 w-4 text-aaau-sand" />
              {ticketsReady ? `${order.tickets.length} ingresso${order.tickets.length > 1 ? "s" : ""} neste pedido` : "Ingressos ainda indisponíveis"}
            </p>
            <p className="mt-2 text-sm text-white/60">{formatEventDate(order.event.startAt)} · {order.event.venueName}</p>
          </div>
        </div>
      </section>

      {!ticketsReady ? (
        <section className="mt-6 rounded-[0.5rem] border border-white/10 bg-white/[0.04] p-6 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-aaau-sand" />
          <h2 className="mt-4 font-display text-3xl uppercase tracking-[0.06em] text-white">
            {order.status === "EXPIRED" || order.status === "CANCELED" ? "Pedido não confirmado" : "Pagamento ainda não confirmado"}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-white/65">
            {order.status === "EXPIRED" || order.status === "CANCELED"
              ? "Não há ingressos liberados para este pedido."
              : "Os ingressos serão liberados após a confirmação do pagamento."}
          </p>
          <Link href="/eventos" className={buttonVariants({ variant: "secondary", size: "md", className: "mt-6" })}>
            Ver eventos
          </Link>
        </section>
      ) : (
        <section className="mt-6 space-y-5">
          {order.tickets.map((ticket, index) => (
            <EventTicketCard
              key={ticket.id}
              ticket={ticket}
              event={order.event}
              index={index}
              total={order.tickets.length}
            />
          ))}
        </section>
      )}
    </main>
  );
}
