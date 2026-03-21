import type { Metadata } from "next";

import { CheckoutPageView } from "@/components/store/checkout-page-view";

export const metadata: Metadata = {
  title: "Checkout",
};

export default function CheckoutPage() {
  return <CheckoutPageView />;
}
