import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/admin-shell";
import { formatCurrency } from "@/lib/utils";
import { getProducts } from "@/lib/data/store";

export const metadata: Metadata = {
  title: "Admin Produtos",
};

export default async function AdminProductsPage() {
  const products = await getProducts();

  return (
    <AdminShell
      activeHref="/admin/produtos"
      title="Produtos"
      description="Base inicial para gestão de catálogo, status, destaque e lançamentos."
    >
      <div className="space-y-4">
        {products.map((product) => (
          <article
            key={product.id}
            className="grid gap-4 rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-5 md:grid-cols-[1.4fr,0.7fr,0.7fr,0.5fr]"
          >
            <div>
              <p className="font-semibold text-white">{product.name}</p>
              <p className="text-sm text-white/60">{product.slug}</p>
            </div>
            <p className="text-sm text-white/70">{product.category}</p>
            <p className="text-sm text-white/70">{formatCurrency(product.price)}</p>
            <p className="text-sm text-white/70">{product.featured ? "Destaque" : "Padrão"}</p>
          </article>
        ))}
      </div>
    </AdminShell>
  );
}
