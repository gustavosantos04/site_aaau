import type { Metadata } from "next";

import { CartPageView } from "@/components/store/cart-page-view";

export const metadata: Metadata = {
  title: "Carrinho",
};

export default function CartPage() {
  return <CartPageView />;
}
