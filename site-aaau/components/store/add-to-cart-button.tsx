"use client";

import { useState } from "react";

import { Button } from "@/components/shared/button";
import { useCart } from "@/features/cart/cart-provider";
import type { Product } from "@/types/store";

export function AddToCartButton({
  product,
  defaultSize,
  customName,
  customNumber,
  disabled,
}: {
  product: Product;
  defaultSize: string;
  customName?: string;
  customNumber?: string;
  disabled?: boolean;
}) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  return (
    <Button
      size="lg"
      className="w-full"
      disabled={disabled}
      onClick={() => {
        addItem(product, defaultSize, { customName, customNumber });
        setAdded(true);
        window.setTimeout(() => setAdded(false), 1200);
      }}
    >
      {added ? "Adicionado" : "Adicionar ao carrinho"}
    </Button>
  );
}
