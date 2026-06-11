"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { Prisma, ProductCategory } from "@prisma/client";
import { z } from "zod";

import { requireAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { productsSeed } from "@/lib/data/seed-content";

export type ProductFormState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const productSchema = z.object({
  productId: z.string().optional(),
  name: z.string().trim().min(3, "Informe um nome com pelo menos 3 caracteres."),
  slug: z.string().trim().optional(),
  description: z.string().trim().min(10, "Descreva o produto com pelo menos 10 caracteres."),
  price: z.coerce.number().positive("Informe um preço maior que zero."),
  imageUrl: z.string().trim().optional(),
  category: z.nativeEnum(ProductCategory),
  sizes: z.string().trim().min(1, "Informe ao menos um tamanho ou variacao."),
  stock: z.coerce.number().int().min(0, "O estoque nao pode ser negativo."),
  requiresCustomization: z.coerce.boolean().default(false),
  featured: z.coerce.boolean().default(false),
  isNew: z.coerce.boolean().default(false),
  isActive: z.coerce.boolean().default(false),
});

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const imageExtensionByType = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

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
    requiresCustomization: formData.get("requiresCustomization") === "on",
    featured: formData.get("featured") === "on",
    isNew: formData.get("isNew") === "on",
    isActive: formData.get("isActive") === "on",
  });
}

function parsePriceValue(value: FormDataEntryValue | null) {
  const normalized = value?.toString().replace(",", ".").trim();
  if (!normalized) {
    return null;
  }

  const price = Number(normalized);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function buildProductMetadata(
  formData: FormData,
  productId: string | undefined,
  slug: string,
  basePrice: number,
): Prisma.InputJsonObject | undefined {
  const seedProduct = productsSeed.find(
    (product) => product.id === productId || product.slug === slug,
  );

  if (!seedProduct?.variants?.length && !seedProduct?.options && !seedProduct?.measurementGuide) {
    return undefined;
  }

  const metadata: Record<string, Prisma.InputJsonValue> = {};

  if (seedProduct.variants?.length) {
    metadata.variants = seedProduct.variants.map((variant, index) => {
      const submittedPrice = parsePriceValue(formData.get(`variantPrice:${variant.id}`));
      const savedVariant: Record<string, Prisma.InputJsonValue> = {
        id: variant.id,
        label: variant.label,
        price: submittedPrice ?? (index === 0 ? basePrice : variant.price),
      };

      if (variant.description) {
        savedVariant.description = variant.description;
      }

      if (variant.requiredOptionIds?.length) {
        savedVariant.requiredOptionIds = variant.requiredOptionIds;
      }

      return savedVariant;
    });
  }

  if (seedProduct.options) {
    metadata.options = seedProduct.options as unknown as Prisma.InputJsonValue;
  }

  if (seedProduct.measurementGuide) {
    metadata.measurementGuide = seedProduct.measurementGuide as unknown as Prisma.InputJsonValue;
  }

  return metadata;
}

async function saveUploadedProductImage(file: File, slug: string) {
  if (file.size === 0) {
    return null;
  }

  if (!allowedImageTypes.has(file.type)) {
    throw new Error("Envie uma imagem JPG, PNG ou WEBP.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("A imagem precisa ter no maximo 5MB.");
  }

  const extension = imageExtensionByType.get(file.type) ?? path.extname(file.name).toLowerCase();
  const fileName = `${slug || "produto"}-${Date.now()}${extension}`;
  const targetDir = path.join(process.cwd(), "public", "images", "products");
  const targetPath = path.join(targetDir, fileName);

  await mkdir(targetDir, { recursive: true });
  await writeFile(targetPath, Buffer.from(await file.arrayBuffer()));

  return `/images/products/${fileName}`;
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
      message: parsed.error.issues[0]?.message ?? "Revise os campos obrigatórios.",
    };
  }

  const data = parsed.data;
  const slug = buildSlug(data.slug || data.name);
  const metadata = buildProductMetadata(formData, data.productId, slug, data.price);
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

    const uploadedFile = formData.get("imageFile");
    const uploadedImageUrl =
      uploadedFile instanceof File ? await saveUploadedProductImage(uploadedFile, slug) : null;
    const imageUrl = uploadedImageUrl ?? data.imageUrl;

    if (!imageUrl) {
      return {
        status: "error",
        message: "Selecione uma imagem existente ou envie uma nova foto.",
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
          metadata,
          category: data.category,
          sizes,
          stock: data.stock,
          requiresCustomization: data.requiresCustomization,
          featured: data.featured,
          isNew: data.isNew,
          isActive: data.isActive,
          images: {
            deleteMany: {},
            create: {
              url: imageUrl,
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
          metadata,
          category: data.category,
          sizes,
          stock: data.stock,
          requiresCustomization: data.requiresCustomization,
          featured: data.featured,
          isNew: data.isNew,
          isActive: data.isActive,
          images: {
            create: {
              url: imageUrl,
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
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Não foi possível salvar o produto agora.",
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
