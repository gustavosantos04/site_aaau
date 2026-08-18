import type { Product } from "@/types/store";

type InventoryProduct = Pick<Product, "stock" | "stockItems">;

export function usesDetailedInventory(product: InventoryProduct) {
  return Boolean(product.stockItems?.length);
}

export function productAvailableStock(product: InventoryProduct) {
  return usesDetailedInventory(product)
    ? (product.stockItems ?? []).reduce((sum, item) => sum + Math.max(0, item.stock), 0)
    : Math.max(0, product.stock);
}

export function productSelectionStock(product: InventoryProduct, variantId?: string, size?: string) {
  if (!usesDetailedInventory(product)) return Math.max(0, product.stock);
  return product.stockItems?.find((item) => item.variantId === (variantId ?? "") && item.size === (size ?? ""))?.stock ?? 0;
}

export function isProductSoldOut(product: InventoryProduct) {
  return productAvailableStock(product) <= 0;
}
