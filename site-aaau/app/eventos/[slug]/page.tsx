import type { Metadata } from "next";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Clock, MapPin, ShieldCheck, Ticket } from "lucide-react";

import { Badge } from "@/components/shared/badge";
import { buttonVariants } from "@/components/shared/button";
import {
  canBuyPublicStatus,
  formatEventDate,
  formatEventDateOnly,
  formatEventTime,
  formatMoney,
  getPublishedTicketEventBySlug,
  getPublicLotStatus,
  publicLotStatusLabel,
  publicStatusLabel,
} from "@/lib/events/public";
import { getTicketLotAvailability } from "@/lib/events/availability";
import { normalizeEventImagePath } from "@/lib/events/images";
import { EventLotOpeningCountdown, EventSaleCountdownRefresh } from "@/components/events/event-sale-countdown";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const event = await getPublishedTicketEventBySlug(slug);

  if (!event) return { title: "Evento" };

  const image = normalizeEventImagePath(event.coverImage || event.bannerImage) || undefined;
  return {
    title: `${event.name} | AAAU`,
    description: event.shortDescription,
    openGraph: {
      title: event.name,
      description: event.shortDescription,
      images: image ? [image] : undefined,
    },
  };
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ codigo?: string; cupom?: string; code?: string }>;
}) {
  const serverNow = new Date();
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const event = await getPublishedTicketEventBySlug(slug);

  if (!event) notFound();

  const canBuy = canBuyPublicStatus(event.publicStatus);
  const image = normalizeEventImagePath(event.bannerImage || event.coverImage) || "/images/brand/event-integration.svg";
  const initialPartnerCode = query.codigo || query.cupom || query.code || "";
  const checkoutPath = initialPartnerCode
    ? `/eventos/${event.slug}/checkout?codigo=${encodeURIComponent(initialPartnerCode)}`
    : `/eventos/${event.slug}/checkout`;

  return (
    <article>
      <section className="relative min-h-[72vh] overflow-hidden">
        <Image src={image} alt="" fill priority className="object-cover" sizes="100vw" />
        <div className="absolute inset-0 bg-gradient-to-t from-aaau-night via-aaau-night/70 to-aaau-night/20" />
        <div className="relative mx-auto flex min-h-[72vh] max-w-7xl flex-col justify-end px-4 pb-10 pt-28 sm:px-6 lg:px-8">
          <div className="max-w-4xl space-y-6">
            <Badge className={canBuy ? "border-aaau-sand/40 bg-aaau-sand/15 text-aaau-sand" : undefined}>
              {publicStatusLabel(event.publicStatus)}
            </Badge>
            <h1 className="break-words font-display text-4xl uppercase tracking-[0.06em] text-white sm:text-7xl sm:tracking-[0.07em] lg:text-8xl">{event.name}</h1>
            <p className="max-w-2xl text-base leading-8 text-white/75 sm:text-lg">{event.shortDescription}</p>
            <div className="flex flex-wrap gap-3 text-sm font-semibold text-white/78">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2"><CalendarDays className="h-4 w-4" />{formatEventDate(event.startAt)}</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2"><MapPin className="h-4 w-4" />{event.venueName}</span>
            </div>
            {canBuy ? (
              <Link href={checkoutPath as Route} className={buttonVariants({ variant: "primary", size: "lg" })}>
                Garantir meu ingresso
              </Link>
            ) : event.publicStatus === "SOON" && event.salesStartAt ? (
              <div className="max-w-xl space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-white/75">As vendas começam em</p>
                  <EventSaleCountdownRefresh salesStartAt={event.salesStartAt.toISOString()} serverNow={serverNow.toISOString()} />
                  <p className="text-sm text-white/65">
                    {new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(event.salesStartAt)}
                  </p>
                </div>
                <button type="button" disabled className={buttonVariants({ variant: "secondary", size: "lg" })}>
                  Aguarde a abertura das vendas
                </button>
              </div>
            ) : (
              <button type="button" disabled className={buttonVariants({ variant: "secondary", size: "lg" })}>
                {event.publicStatus === "SOON" ? "Vendas em breve" : publicStatusLabel(event.publicStatus)}
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[0.78fr,1.22fr] lg:px-8">
        <aside className="space-y-4">
          {[
            { label: "Data", value: formatEventDateOnly(event.startAt), Icon: CalendarDays },
            { label: "Horário", value: formatEventTime(event.startAt), Icon: Clock },
            { label: "Local", value: event.venueAddress || event.venueName, Icon: MapPin },
            { label: "Classificação", value: event.minimumAge ? `${event.minimumAge}+` : "Livre", Icon: ShieldCheck },
          ].map(({ label, value, Icon }) => (
            <div key={label} className="rounded-[0.5rem] border border-white/10 bg-white/[0.04] p-5">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/45"><Icon className="h-4 w-4" />{label}</p>
              <p className="mt-2 text-sm font-semibold text-white/86">{value}</p>
            </div>
          ))}
        </aside>

        <div className="space-y-8">
          <section className="rounded-[0.5rem] border border-white/10 bg-white/[0.04] p-6">
            <h2 className="break-words font-display text-3xl uppercase tracking-[0.06em] text-white sm:tracking-[0.08em]">Sobre o evento</h2>
            <div className="mt-4 space-y-4 text-sm leading-7 text-white/70">
              {event.description.split(/\n+/).map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>

          <section className="rounded-[0.5rem] border border-white/10 bg-white/[0.04] p-6">
            <h2 className="break-words font-display text-3xl uppercase tracking-[0.06em] text-white sm:tracking-[0.08em]">Ingressos e lotes</h2>
            <div className="mt-5 grid gap-3">
              {event.lots.map((lot) => {
                const status = getPublicLotStatus(lot, event.currentLot?.id ?? null, serverNow);
                const available = getTicketLotAvailability(lot);
                return (
                  <div key={lot.id} className="rounded-[0.5rem] border border-white/10 bg-aaau-night/45 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold uppercase tracking-[0.16em] text-white">{lot.name}</p>
                        <p className="mt-1 text-sm font-semibold text-white/70">
                          {status === "UPCOMING" && lot.salesStartAt ? (
                            <EventLotOpeningCountdown salesStartAt={lot.salesStartAt.toISOString()} serverNow={serverNow.toISOString()} />
                          ) : publicLotStatusLabel(status)}
                        </p>
                        {status === "UPCOMING" && lot.salesStartAt ? (
                          <p className="mt-1 text-xs text-white/45">Abre em {formatEventDate(lot.salesStartAt)}</p>
                        ) : null}
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="font-display text-2xl text-aaau-sand">{formatMoney(lot.price)}</p>
                        {event.showRemainingTickets && available > 0 ? <p className="text-xs text-white/50">{available} disponíveis</p> : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs leading-6 text-white/55">
              <Ticket className="h-4 w-4" />A disponibilidade e o lote final são confirmados novamente antes do pagamento.
            </p>
          </section>
        </div>
      </section>
    </article>
  );
}
