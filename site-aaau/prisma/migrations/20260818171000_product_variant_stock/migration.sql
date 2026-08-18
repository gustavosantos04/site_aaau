-- Optional per-variant/per-size inventory. Product.stock remains the general-stock fallback.
CREATE TABLE "ProductStockItem" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL DEFAULT '',
    "size" TEXT NOT NULL DEFAULT '',
    "stock" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductStockItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductStockItem_productId_variantId_size_key"
ON "ProductStockItem"("productId", "variantId", "size");

CREATE INDEX "ProductStockItem_productId_stock_idx"
ON "ProductStockItem"("productId", "stock");

ALTER TABLE "ProductStockItem"
ADD CONSTRAINT "ProductStockItem_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
