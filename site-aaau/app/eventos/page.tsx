import type { Metadata } from "next";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { CalendarDays, MapPin, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/shared/badge";
import { buttonVariants } from "@/components/shared/button";
import {
  canBuyPublicStatus,
  eventPriceLabel,
  formatEventDate,
  getPublishedTicketEvents,
  publicStatusLabel,
} from "@/lib/events/public";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Eventos",
  description: "Eventos oficiais da AU com compra segura de ingressos pelo site oficial.",
};

export default async function EventsPage() {
  const events = await getPublishedTicketEvents();

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="grid gap-8 lg:grid-cols-[0.85fr,1.15fr] lg:items-end">
        <div className="space-y-5">
          <Badge>Eventos oficiais AU</Badge>
          <h1 className="max-w-full break-words font-display text-3xl uppercase leading-tight tracking-[0.05em] text-white sm:text-7xl sm:tracking-[0.08em]">
            Ingressos para <span className="block">viver a AU</span>
          </h1>
          <p className="max-w-2xl text-base leading-8 text-white/70">
            Compra realizada diretamente no site oficial da AU. O pagamento é processado pelo Mercado Pago e os ingressos são liberados após a confirmação.
          </p>
        </div>
        <div className="grid gap-3 rounded-[0.5rem] border border-white/10 bg-white/[0.04] p-4 sm:grid-cols-3">
          {["Evento oficial AU", "Pagamento Mercado Pago", "Ingresso individual"].map((item) => (
            <div key={item} className="flex items-center gap-3 text-sm font-semibold text-white/78">
              <ShieldCheck className="h-5 w-5 text-aaau-sand" />
              {item}
            </div>
          ))}
        </div>
      </div>

      {events.length === 0 ? (
        <div className="mt-12 rounded-[0.5rem] border border-white/10 bg-white/[0.04] p-8 text-center">
          <h2 className="font-display text-3xl uppercase tracking-[0.08em] text-white">Nenhum evento anunciado por enquanto.</h2>
          <p className="mt-3 text-sm leading-7 text-white/65">Quando a AU preparar a próxima, ela aparece aqui.</p>
        </div>
      ) : (
        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          {events.map((event) => {
            const canBuy = canBuyPublicStatus(event.publicStatus);
            const image = event.coverImage || event.bannerImage || "/images/brand/event-launch.svg";
            return (
              <article key={event.id} className="overflow-hidden rounded-[0.5rem] border border-white/10 bg-[#111]/80 shadow-glow">
                <div className="relative aspect-[16/9] bg-white/[0.04]">
                  <Image src={image} alt="" fill className="object-cover" sizes="(min-width:1024px) 50vw, 100vw" />
                  <div className="absolute inset-0 bg-gradient-to-t from-aaau-night via-aaau-night/25 to-transparent" />
                  <div className="absolute left-4 top-4">
                    <Badge className={canBuy ? "border-aaau-sand/40 bg-aaau-sand/15 text-aaau-sand" : undefined}>
                      {publicStatusLabel(event.publicStatus)}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-5 p-5 sm:p-6">
                  <div className="space-y-2">
                    <h2 className="break-words font-display text-3xl uppercase tracking-[0.06em] text-white sm:text-4xl sm:tracking-[0.08em]">{event.name}</h2>
                    <p className="line-clamp-2 text-sm leading-6 text-white/65">{event.shortDescription}</p>
                  </div>
                  <div className="grid gap-3 text-sm text-white/72 sm:grid-cols-2">
                    <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-aaau-sand" />{formatEventDate(event.startAt)}</span>
                    <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-aaau-sand" />{event.venueName}</span>
                  </div>
                  <div className="flex flex-col gap-4 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-aaau-sand">{eventPriceLabel(event)}</p>
                    <Link
                      href={`/eventos/${event.slug}` as Route}
                      className={buttonVariants({
                        variant: canBuy ? "primary" : "secondary",
                        size: "sm",
                        className: "w-full tracking-[0.12em] sm:w-auto sm:tracking-[0.18em]",
                      })}
                    >
                      {canBuy ? "Garantir ingresso" : "Ver evento"}
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
