"use server";

import { revalidatePath } from "next/cache";
import { ProductCategory } from "@prisma/client";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export type ProductFormState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const productSchema = z.object({
  productId: z.string().optional(),
  name: z.string().trim().min(3, "Informe um nome com pelo menos 3 caracteres."),
  slug: z.string().trim().optional(),
  description: z.string().trim().min(10, "Descreva o produto com pelo menos 10 caracteres."),
  price: z.coerce.number().positive("Informe um preco maior que zero."),
  imageUrl: z.string().trim().min(1, "Informe a imagem principal do produto."),
  category: z.nativeEnum(ProductCategory),
  sizes: z.string().trim().min(1, "Informe ao menos um tamanho ou variacao."),
  stock: z.coerce.number().int().min(0, "O estoque nao pode ser negativo."),
  featured: z.coerce.boolean().default(false),
  isNew: z.coerce.boolean().default(false),
  isActive: z.coerce.boolean().default(false),
});

function buildSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function parseProductForm(formData: FormData) {
  return productSchema.safeParse({
    productId: formData.get("productId")?.toString() || undefined,
    name: formData.get("name"),
    slug: formData.get("slug")?.toString() || undefined,
    description: formData.get("description"),
    price: formData.get("price")?.toString().replace(",", "."),
    imageUrl: formData.get("imageUrl"),
    category: formData.get("category"),
    sizes: formData.get("sizes"),
    stock: formData.get("stock"),
    featured: formData.get("featured") === "on",
    isNew: formData.get("isNew") === "on",
    isActive: formData.get("isActive") === "on",
  });
}

export async function saveProductAction(
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  await requireAdminSession();

  if (!process.env.DATABASE_URL) {
    return {
      status: "error",
      message: "Configure o DATABASE_URL antes de salvar produtos.",
    };
  }

  const parsed = parseProductForm(formData);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Revise os campos obrigatorios.",
    };
  }

  const data = parsed.data;
  const slug = buildSlug(data.slug || data.name);
  const sizes = data.sizes
    .split(",")
    .map((size) => size.trim())
    .filter(Boolean);

  if (!slug) {
    return {
      status: "error",
      message: "Informe um slug valido ou ajuste o nome do produto.",
    };
  }

  if (sizes.length === 0) {
    return {
      status: "error",
      message: "Informe ao menos um tamanho ou variacao.",
    };
  }

  try {
    const existingSlug = await prisma.product.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existingSlug && existingSlug.id !== data.productId) {
      return {
        status: "error",
        message: "Ja existe um produto com esse slug. Ajuste o slug antes de salvar.",
      };
    }

    if (data.productId) {
      await prisma.product.update({
        where: { id: data.productId },
        data: {
          name: data.name,
          slug,
          description: data.description,
          price: data.price,
          category: data.category,
          sizes,
          stock: data.stock,
          featured: data.featured,
          isNew: data.isNew,
          isActive: data.isActive,
          images: {
            deleteMany: {},
            create: {
              url: data.imageUrl,
              alt: data.name,
              isPrimary: true,
              sortOrder: 0,
            },
          },
        },
      });
    } else {
      await prisma.product.create({
        data: {
          name: data.name,
          slug,
          description: data.description,
          price: data.price,
          category: data.category,
          sizes,
          stock: data.stock,
          featured: data.featured,
          isNew: data.isNew,
          isActive: data.isActive,
          images: {
            create: {
              url: data.imageUrl,
              alt: data.name,
              isPrimary: true,
              sortOrder: 0,
            },
          },
        },
      });
    }

    revalidatePath("/admin/produtos");
    revalidatePath("/produtos");
    revalidatePath("/");

    return {
      status: "success",
      message: data.productId ? "Produto atualizado." : "Produto cadastrado.",
    };
  } catch {
    return {
      status: "error",
      message: "Nao foi possivel salvar o produto agora.",
    };
  }
}

export async function toggleProductStatusAction(formData: FormData) {
  await requireAdminSession();

  const productId = formData.get("productId")?.toString();
  const isActive = formData.get("isActive") === "true";

  if (!productId || !process.env.DATABASE_URL) {
    return;
  }

  await prisma.product.update({
    where: { id: productId },
    data: { isActive },
  });

  revalidatePath("/admin/produtos");
  revalidatePath("/produtos");
  revalidatePath("/");
}
