"use client";

import { useState } from "react";

import { Button } from "@/components/shared/button";
import { useCart } from "@/features/cart/cart-provider";
import type { Product } from "@/types/store";

export function AddToCartButton({
  product,
  defaultSize,
}: {
  product: Product;
  defaultSize: string;
}) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  return (
    <Button
      size="lg"
      className="w-full"
      onClick={() => {
        addItem(product, defaultSize);
        setAdded(true);
        window.setTimeout(() => setAdded(false), 1200);
      }}
    >
      {added ? "Adicionado" : "Adicionar ao carrinho"}
    </Button>
  );
}
