import type { Metadata } from "next";

import { PaymentReturnPage } from "@/components/store/payment-return-page";

export const metadata: Metadata = {
  title: "Pagamento Não Concluído",
};

export default async function PaymentErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const params = await searchParams;

  return <PaymentReturnPage orderId={params.orderId} variant="error" />;
}
