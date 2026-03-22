import Image from "next/image";
import type { Route } from "next";
import Link from "next/link";

import { Badge } from "@/components/shared/badge";
import { AddToCartButton } from "@/components/store/add-to-cart-button";
import { siteConfig } from "@/lib/site";
import { cn, formatCurrency } from "@/lib/utils";
import type { Product } from "@/types/store";

export function ProductCard({
  product,
  variant = "default",
}: {
  product: Product;
  variant?: "default" | "featured";
}) {
  const image = product.images.find((entry) => entry.isPrimary)?.url ?? product.images[0]?.url;
  const isFeaturedCard = variant === "featured";

  return (
    <article
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03]",
        isFeaturedCard && "bg-white/[0.02] shadow-[0_24px_70px_rgba(0,0,0,0.28)]",
      )}
    >
      <Link
        href={`/produtos/${product.slug}` as Route}
        className="relative block overflow-hidden"
      >
        {isFeaturedCard ? null : (
          <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-2">
            {product.featured ? <Badge>Destaque</Badge> : null}
            {product.isNew ? (
              <Badge className="border-aaau-ember/[0.60] text-white">Lancamento</Badge>
            ) : null}
          </div>
        )}

        <div
          className={cn(
            "relative overflow-hidden bg-[radial-gradient(circle_at_top,rgba(166,23,48,0.3),transparent_45%),linear-gradient(180deg,#111111,#090909)]",
            isFeaturedCard ? "aspect-[4/4.25]" : "aspect-[4/4.4]",
          )}
        >
          {image ? (
            <Image
              src={image}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover transition duration-500 group-hover:scale-105"
            />
          ) : null}
        </div>
      </Link>

      <div
        className={cn(
          "flex flex-1 flex-col p-4 sm:p-5",
          isFeaturedCard ? "gap-6" : "space-y-5",
        )}
      >
        {isFeaturedCard ? (
          <div className="flex min-h-[5.75rem] items-start justify-between gap-4">
            <h3 className="line-clamp-2 max-w-[10ch] font-display text-[1.85rem] uppercase leading-[0.9] tracking-[0.08em] text-white sm:text-3xl">
              {product.name}
            </h3>
            <span className="shrink-0 pt-1 text-sm font-semibold uppercase tracking-[0.18em] text-aaau-sand">
              {formatCurrency(product.price)}
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">
              {siteConfig.categoryLabels[product.category]}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-display text-[1.85rem] uppercase tracking-[0.08em] text-white sm:text-3xl">
                  {product.name}
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/[0.65]">
                  {product.description}
                </p>
              </div>
              <span className="text-sm font-semibold uppercase tracking-[0.18em] text-aaau-sand sm:pt-1">
                {formatCurrency(product.price)}
              </span>
            </div>
          </div>
        )}

        {isFeaturedCard ? null : (
          <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-white/[0.45]">
            {product.sizes.map((size) => (
              <span
                key={size}
                className="rounded-full border border-white/10 px-3 py-1.5"
              >
                {size}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto">
          <AddToCartButton product={product} defaultSize={product.sizes[0] ?? "Unico"} />
        </div>
      </div>
    </article>
  );
}
