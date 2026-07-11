import type { Metadata } from "next";

import { EventPaymentReturn } from "@/components/events/event-payment-return";

export const metadata: Metadata = {
  title: "Pagamento não concluído",
  robots: { index: false, follow: false },
};

export default function EventPaymentErrorPage() {
  return <EventPaymentReturn variant="erro" />;
}
