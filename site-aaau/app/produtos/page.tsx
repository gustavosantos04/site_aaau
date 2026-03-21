import type { Metadata } from "next";

import { ProductCard } from "@/components/store/product-card";
import { getProducts } from "@/lib/data/store";

export const metadata: Metadata = {
  title: "Catálogo",
  description: "Coleção inicial da AAAU com foco em produto, identidade e conversão.",
};

export default async function ProductsPage() {
  const products = await getProducts();

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-3xl space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
          Catálogo
        </p>
        <h1 className="font-display text-6xl uppercase tracking-[0.08em] text-white">
          Produtos AAAU
        </h1>
        <p className="text-base leading-8 text-white/[0.68]">
          Fundação da loja pronta para novos drops, filtros e integrações futuras.
        </p>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
