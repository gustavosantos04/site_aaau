import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/admin-shell";
import { getProducts } from "@/lib/data/store";
import { formatCurrency } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Admin Produtos",
};

export default async function AdminProductsPage() {
  const products = await getProducts();

  return (
    <AdminShell
      activeHref="/admin/produtos"
      title="Produtos"
      description="Base inicial para gestao de catalogo, status, destaque e lancamentos."
    >
      <div className="space-y-4">
        {products.map((product) => (
          <article
            key={product.id}
            className="grid gap-3 rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-5 sm:gap-4 md:grid-cols-[1.4fr,0.7fr,0.7fr,0.5fr]"
          >
            <div>
              <p className="font-semibold text-white">{product.name}</p>
              <p className="text-sm text-white/60">{product.slug}</p>
            </div>
            <p className="text-sm text-white/70">
              <span className="mr-2 text-white/[0.45] md:hidden">Categoria:</span>
              {product.category}
            </p>
            <p className="text-sm text-white/70">
              <span className="mr-2 text-white/[0.45] md:hidden">Preco:</span>
              {formatCurrency(product.price)}
            </p>
            <p className="text-sm text-white/70">
              <span className="mr-2 text-white/[0.45] md:hidden">Status:</span>
              {product.featured ? "Destaque" : "Padrao"}
            </p>
          </article>
        ))}
      </div>
    </AdminShell>
  );
}
