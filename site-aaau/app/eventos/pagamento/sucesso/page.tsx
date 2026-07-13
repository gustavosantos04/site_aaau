import type { Metadata } from "next";

import { EventPaymentReturn } from "@/components/events/event-payment-return";

export const metadata: Metadata = {
  title: "Pagamento do evento",
  robots: { index: false, follow: false },
};

export default function EventPaymentSuccessPage() {
  return <EventPaymentReturn variant="sucesso" />;
}
