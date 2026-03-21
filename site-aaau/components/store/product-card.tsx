import Image from "next/image";
import type { Route } from "next";
import Link from "next/link";

import { Badge } from "@/components/shared/badge";
import { AddToCartButton } from "@/components/store/add-to-cart-button";
import { siteConfig } from "@/lib/site";
import { formatCurrency } from "@/lib/utils";
import type { Product } from "@/types/store";

export function ProductCard({ product }: { product: Product }) {
  const image = product.images.find((entry) => entry.isPrimary)?.url ?? product.images[0]?.url;

  return (
    <article className="group overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03]">
      <Link
        href={`/produtos/${product.slug}` as Route}
        className="relative block overflow-hidden"
      >
        <div className="absolute left-4 top-4 z-10 flex gap-2">
          {product.featured ? <Badge>Destaque</Badge> : null}
          {product.isNew ? (
            <Badge className="border-aaau-ember/[0.60] text-white">Lançamento</Badge>
          ) : null}
        </div>

        <div className="relative aspect-[4/4.4] overflow-hidden bg-[radial-gradient(circle_at_top,rgba(166,23,48,0.3),transparent_45%),linear-gradient(180deg,#111111,#090909)]">
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

      <div className="space-y-5 p-5">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">
            {siteConfig.categoryLabels[product.category]}
          </p>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-display text-3xl uppercase tracking-[0.08em] text-white">
                {product.name}
              </h3>
              <p className="mt-2 text-sm leading-6 text-white/[0.65]">
                {product.description}
              </p>
            </div>
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-aaau-sand">
              {formatCurrency(product.price)}
            </span>
          </div>
        </div>

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

        <AddToCartButton product={product} defaultSize={product.sizes[0] ?? "Único"} />
      </div>
    </article>
  );
}
