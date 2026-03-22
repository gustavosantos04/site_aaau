"use client";

import Link from "next/link";
import { ProductCard } from "@/components/store/product-card";
import { Reveal } from "@/components/shared/reveal";
import { SectionHeading } from "@/components/shared/section-heading";
import { buttonVariants } from "@/components/shared/button";
import type { Product } from "@/types/store";

export function FeaturedProductsSection({ products }: { products: Product[] }) {
  return (
    <section 
      id="produtos" 
      className="relative z-20 mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
    >
      <div data-products-stage className="will-change-transform">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <Reveal>
          <SectionHeading
            eyebrow="Produtos em destaque"
            title="Drops pensados para vender."
            description="A primeira coleção já nasce com linguagem premium, foco em conversão e espaço claro para futuras ativações sazonais."
          />
        </Reveal>
        <Reveal>
          <Link
            href="/produtos"
            className={buttonVariants({ variant: "secondary", size: "lg" })}
          >
            Ver catálogo completo
          </Link>
        </Reveal>
      </div>

      <div className="mt-10 grid items-stretch gap-6 lg:grid-cols-3">
        {products.map((product, index) => (
          <Reveal key={product.id} delay={index * 0.06}>
            <div className="h-full">
              <ProductCard product={product} variant="featured" />
            </div>
          </Reveal>
        ))}
      </div>
      </div>
    </section>
  );
}
