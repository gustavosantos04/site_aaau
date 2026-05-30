import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/admin-shell";
import { ProductAdminForm } from "@/components/admin/product-admin-form";
import { requireAdminSession } from "@/lib/auth";
import { getAdminProducts } from "@/lib/data/store";

export const metadata: Metadata = {
  title: "Admin Produtos",
};

export default async function AdminProductsPage() {
  await requireAdminSession();

  const products = await getAdminProducts();

  return (
    <AdminShell
      activeHref="/admin/produtos"
      title="Produtos"
      description="Cadastre, edite e inative produtos do catalogo sem alterar codigo."
    >
      <ProductAdminForm products={products} />
    </AdminShell>
  );
}
