import type { Metadata } from "next";
import { readdir } from "node:fs/promises";
import path from "node:path";

import { AdminShell } from "@/components/admin/admin-shell";
import { ProductAdminForm } from "@/components/admin/product-admin-form";
import { requireAdminSession } from "@/lib/auth";
import { getAdminProducts } from "@/lib/data/store";

export const metadata: Metadata = {
  title: "Admin Produtos",
};

async function getProductImageOptions() {
  const productsImageDir = path.join(process.cwd(), "public", "images", "products");
  const entries = await readdir(productsImageDir, { withFileTypes: true }).catch(() => []);
  const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".svg"]);

  return entries
    .filter((entry) => entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => `/images/products/${entry.name}`)
    .sort((a, b) => a.localeCompare(b));
}

export default async function AdminProductsPage() {
  await requireAdminSession();

  const [products, imageOptions] = await Promise.all([
    getAdminProducts(),
    getProductImageOptions(),
  ]);

  return (
    <AdminShell
      activeHref="/admin/produtos"
      title="Produtos"
      description="Cadastre, edite e inative produtos do catalogo sem alterar codigo."
    >
      <ProductAdminForm products={products} imageOptions={imageOptions} />
    </AdminShell>
  );
}
