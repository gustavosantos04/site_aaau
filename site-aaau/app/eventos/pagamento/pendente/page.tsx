import type { Metadata } from "next";

import { EventPaymentReturn } from "@/components/events/event-payment-return";

export const metadata: Metadata = {
  title: "Pagamento pendente",
  robots: { index: false, follow: false },
};

export default function EventPaymentPendingPage() {
  return <EventPaymentReturn variant="pendente" />;
}
