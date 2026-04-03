import { PrismaClient } from "@prisma/client";

import {
  adminUsersSeed,
  couponsSeed,
  eventsSeed,
  ordersSeed,
  productsSeed,
} from "../lib/data/seed-content";
import {
  managementAreaBlueprints,
  managementMembersFallbackByArea,
} from "../lib/data/management";

const prisma = new PrismaClient();

async function main() {
  await prisma.managementMemberRecord.deleteMany();
  await prisma.managementAreaRecord.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.product.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.event.deleteMany();
  await prisma.adminUser.deleteMany();

  for (const product of productsSeed) {
    await prisma.product.create({
      data: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        price: product.price,
        description: product.description,
        category: product.category,
        sizes: product.sizes,
        featured: product.featured,
        isNew: product.isNew,
        isActive: product.isActive,
        images: {
          create: product.images.map((image) => ({
            id: image.id,
            url: image.url,
            alt: image.alt,
            isPrimary: image.isPrimary,
            sortOrder: image.sortOrder,
          })),
        },
      },
    });
  }

  for (const coupon of couponsSeed) {
    await prisma.coupon.create({
      data: {
        id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        isActive: coupon.isActive,
      },
    });
  }

  for (const event of eventsSeed) {
    await prisma.event.create({
      data: {
        id: event.id,
        title: event.title,
        slug: event.slug,
        excerpt: event.excerpt,
        startsAt: new Date(event.startsAt),
        location: event.location,
        coverImage: event.coverImage,
        isFeatured: event.isFeatured,
        isActive: event.isActive,
      },
    });
  }

  for (const area of managementAreaBlueprints) {
    await prisma.managementAreaRecord.create({
      data: {
        slug: area.id,
        title: area.title,
        members: {
          create: (managementMembersFallbackByArea[area.id] ?? []).map((member, index) => ({
            name: member.name,
            role: member.role,
            image: member.image,
            sortOrder: index,
          })),
        },
      },
    });
  }

  for (const adminUser of adminUsersSeed) {
    await prisma.adminUser.create({
      data: adminUser,
    });
  }

  for (const order of ordersSeed) {
    await prisma.order.create({
      data: {
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        notes: order.notes,
        status: order.status,
        subtotal: order.subtotal,
        discount: order.discount,
        total: order.total,
        couponId: couponsSeed[0]?.id,
        items: {
          create: order.items.map((item) => ({
            id: item.id,
            productId: item.productId,
            productName: item.productName,
            productSlug: item.productSlug,
            size: item.size,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
          })),
        },
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
