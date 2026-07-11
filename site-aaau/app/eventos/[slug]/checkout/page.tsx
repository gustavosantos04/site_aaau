import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EventCheckoutForm } from "@/components/events/event-checkout-form";
import { canBuyPublicStatus, getPublishedTicketEventBySlug } from "@/lib/events/public";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout de evento",
  robots: { index: false, follow: false },
};

export default async function EventCheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getPublishedTicketEventBySlug(slug);

  if (!event || !canBuyPublicStatus(event.publicStatus) || !event.currentLot) {
    notFound();
  }

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
