"use client";

import type { ReactNode } from "react";

import { CartProvider } from "@/features/cart/cart-provider";

export function Providers({ children }: { children: ReactNode }) {
  return <CartProvider>{children}</CartProvider>;
}
