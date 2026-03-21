import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  couponsSeed,
  eventsSeed,
  ordersSeed,
  productsSeed,
} from "@/lib/data/seed-content";
import type {
  AdminSnapshot,
  Coupon,
  EventItem,
  OrderData,
  Product,
} from "@/types/store";

function normalizeProduct(product: {
  id: string;
  name: string;
  slug: string;
  price: Prisma.Decimal | number;
  description: string;
  category: Product["category"];
  sizes: string[];
  featured: boolean;
  isNew: boolean;
  isActive: boolean;
  images: Product["images"];
}): Product {
  return {
    ...product,
    price: Number(product.price),
  };
}

async function withFallback<T>(query: () => Promise<T>, fallback: T): Promise<T> {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error("Database disabled");
    }
    return await query();
  } catch {
    return fallback;
  }
}

export async function getProducts() {
  return withFallback(
    async () => {
      const products = await prisma.product.findMany({
        where: { isActive: true },
        include: { images: { orderBy: { sortOrder: "asc" } } },
        orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
      });
      return products.map((product) =>
        normalizeProduct({
          ...product,
          images: product.images,
        }),
      );
    },
    productsSeed,
  );
}

export async function getFeaturedProducts() {
  const products = await getProducts();
  return products.filter((product) => product.featured).slice(0, 3);
}

export async function getProductBySlug(slug: string) {
  return withFallback(
    async () => {
      const product = await prisma.product.findUnique({
        where: { slug },
        include: { images: { orderBy: { sortOrder: "asc" } } },
      });
      return product
        ? normalizeProduct({
            ...product,
            images: product.images,
          })
        : null;
    },
    productsSeed.find((product) => product.slug === slug) ?? null,
  );
}

export async function getCoupons() {
  return withFallback(
    async () => {
      const coupons = await prisma.coupon.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
      });
      return coupons.map((coupon) => ({
        id: coupon.id,
        code: coupon.code,
        description: coupon.description ?? undefined,
        discountType: coupon.discountType,
        discountValue: Number(coupon.discountValue),
        isActive: coupon.isActive,
      })) satisfies Coupon[];
    },
    couponsSeed,
  );
}

export async function getEvents() {
  return withFallback(
    async () => {
      const events = await prisma.event.findMany({
        where: { isActive: true },
        orderBy: { startsAt: "asc" },
      });
      return events.map((event) => ({
        id: event.id,
        title: event.title,
        slug: event.slug,
        excerpt: event.excerpt,
        startsAt: event.startsAt.toISOString(),
        location: event.location,
        coverImage: event.coverImage ?? undefined,
        isFeatured: event.isFeatured,
        isActive: event.isActive,
      })) satisfies EventItem[];
    },
    eventsSeed,
  );
}

export async function getOrders() {
  return withFallback(
    async () => {
      const orders = await prisma.order.findMany({
        include: { items: true },
        orderBy: { createdAt: "desc" },
      });
      return orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        status: order.status,
        subtotal: Number(order.subtotal),
        discount: Number(order.discount),
        total: Number(order.total),
        notes: order.notes ?? undefined,
        createdAt: order.createdAt.toISOString(),
        items: order.items.map((item) => ({
          id: item.id,
          productId: item.productId ?? undefined,
          productName: item.productName,
          productSlug: item.productSlug,
          size: item.size ?? undefined,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          lineTotal: Number(item.lineTotal),
        })),
      })) satisfies OrderData[];
    },
    ordersSeed,
  );
}

export async function getDashboardSnapshot(): Promise<AdminSnapshot> {
  const [products, coupons, orders] = await Promise.all([
    getProducts(),
    getCoupons(),
    getOrders(),
  ]);

  return {
    totalProducts: products.length,
    activeOrders: orders.filter((order) => order.status !== "FULFILLED").length,
    activeCoupons: coupons.filter((coupon) => coupon.isActive).length,
    featuredProducts: products.filter((product) => product.featured).length,
  };
}
