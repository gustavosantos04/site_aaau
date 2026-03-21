"use client";

import { useState } from "react";

import { AddToCartButton } from "@/components/store/add-to-cart-button";
import { siteConfig } from "@/lib/site";
import { cn, formatCurrency } from "@/lib/utils";
import type { Product } from "@/types/store";

export function ProductPurchasePanel({ product }: { product: Product }) {
  const [selectedSize, setSelectedSize] = useState(product.sizes[0] ?? "Unico");

  return (
    <div className="space-y-6 rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 sm:space-y-8 sm:p-6">
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
          {siteConfig.categoryLabels[product.category]}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-4xl uppercase tracking-[0.08em] text-white sm:text-5xl">
              {product.name}
            </h1>
            <p className="mt-3 text-sm leading-7 text-white/[0.68] sm:mt-4 sm:text-base sm:leading-8">
              {product.description}
            </p>
          </div>
          <span className="text-sm font-semibold uppercase tracking-[0.18em] text-aaau-sand">
            {formatCurrency(product.price)}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
          Tamanho
        </p>
        <div className="flex flex-wrap gap-3">
          {product.sizes.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setSelectedSize(size)}
              className={cn(
                "rounded-full border px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] transition",
                selectedSize === size
                  ? "border-aaau-ember bg-aaau-ember text-white"
                  : "border-white/[0.12] bg-white/[0.03] text-white/70 hover:border-white/25",
              )}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/[0.65]">
        <p className="font-semibold uppercase tracking-[0.18em] text-white/60">
          Politica inicial
        </p>
        <p className="mt-2">{siteConfig.policyNote}</p>
      </div>

      <AddToCartButton product={product} defaultSize={selectedSize} />
    </div>
  );
}
