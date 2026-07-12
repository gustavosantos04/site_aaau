import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EventCheckoutForm } from "@/components/events/event-checkout-form";
import { EventSaleCountdownRefresh } from "@/components/events/event-sale-countdown";
import { buttonVariants } from "@/components/shared/button";
import { canBuyPublicStatus, getPublishedTicketEventBySlug } from "@/lib/events/public";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout de evento",
  robots: { index: false, follow: false },
};

export default async function EventCheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const serverNow = new Date();
  const { slug } = await params;
  const event = await getPublishedTicketEventBySlug(slug);

  if (!event) notFound();

  if (event.publicStatus === "SOON" && event.salesStartAt) {
    return (
      <section className="mx-auto flex min-h-[65vh] max-w-3xl items-center px-4 py-10 sm:px-6">
        <div className="w-full space-y-6 rounded-[0.5rem] border border-white/10 bg-white/[0.04] p-5 sm:p-8">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase text-aaau-sand">{event.name}</p>
            <h1 className="font-display text-4xl uppercase text-white sm:text-5xl">Vendas ainda nao iniciadas</h1>
            <p className="text-sm leading-6 text-white/65">
              A abertura acontece em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(event.salesStartAt)}.
            </p>
          </div>
          <EventSaleCountdownRefresh salesStartAt={event.salesStartAt.toISOString()} serverNow={serverNow.toISOString()} />
          <Link href={`/eventos/${event.slug}` as Route} className={buttonVariants({ variant: "secondary", size: "lg", className: "w-full" })}>Voltar ao evento</Link>
        </div>
      </section>
    );
  }

  if (!canBuyPublicStatus(event.publicStatus) || !event.currentLot) notFound();

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <EventCheckoutForm
        event={{
          slug: event.slug,
          name: event.name,
          startAt: event.startAt.toISOString(),
          venueName: event.venueName,
          maxTicketsPerOrder: event.maxTicketsPerOrder,
          currentLotName: event.currentLot.name,
          currentLotPrice: event.currentLot.price.toFixed(2),
          requireParticipantEmail: event.requireParticipantEmail,
          requireParticipantPhone: event.requireParticipantPhone,
          requireBirthDate: event.requireBirthDate,
          requireInstitution: event.requireInstitution,
          requireCourse: event.requireCourse,
          requireCampus: event.requireCampus,
        }}
      />
    </section>
  );
}
