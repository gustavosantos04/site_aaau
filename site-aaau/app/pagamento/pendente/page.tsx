import type { Metadata } from "next";

import { PaymentReturnPage } from "@/components/store/payment-return-page";

export const metadata: Metadata = {
  title: "Pagamento Pendente",
};

export default async function PaymentPendingPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const params = await searchParams;

  return <PaymentReturnPage orderId={params.orderId} variant="pending" />;
}
