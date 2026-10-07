import { loadEnvConfig } from "@next/env";
import { Prisma, PrismaClient } from "@prisma/client";
import { readdir } from "node:fs/promises";
import path from "node:path";

loadEnvConfig(process.cwd(), false);
const prisma = new PrismaClient();
const mode = process.argv[2] ?? "create";
const products = [
  {
    name: "Uniforme de Basquete AAAU", slug: "uniforme-basquete-aaau", category: "UNIFORM" as const,
    description: "Uniforme de Basquete AAAU. Escolha entre somente regata ou conjunto completo com regata e calção.",
    price: 85, photoPrefix: "basquete-",
    variants: [
      { id: "regata", label: "Regata", price: 85 },
      { id: "conjunto-completo", label: "Conjunto Completo", description: "Regata + Calção", price: 135 },
    ],
  },
  {
    name: "Camiseta AAAU 2026", slug: "camiseta-aaau-2026", category: "APPAREL" as const,
    description: "Camiseta AAAU 2026. Descrição provisória, a ser completada no cadastro do produto.",
    price: 65, photoPrefix: "camiseta-aaau-2026-", variants: [],
  },
];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  if (!['create', 'attach'].includes(mode)) throw new Error("Use create ou attach.");
  const filenames = mode === "attach" ? await readdir(path.join(process.cwd(), "public/images/products")) : [];
  for (const entry of products) {
    const photos = filenames.filter((filename) => filename.startsWith(entry.photoPrefix) && /\.(png|jpe?g|webp)$/i.test(filename)).sort();
    if (mode === "attach" && !photos.length) throw new Error(`Nenhuma foto encontrada para ${entry.name} (prefixo ${entry.photoPrefix}).`);
  }
  await prisma.$transaction(async (tx) => {
    for (const entry of products) {
      const existing = await tx.product.findUnique({ where: { slug: entry.slug }, include: { images: true } });
      const saved = existing?.metadata;
      const metadata = {
        ...(saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {}),
        variants: entry.variants,
      } as Prisma.InputJsonObject;
      const product = mode === "create" ? await tx.product.upsert({
        where: { slug: entry.slug },
        create: {
          name: entry.name, slug: entry.slug, category: entry.category, description: entry.description,
          price: entry.price, metadata, sizes: ["P", "M", "G", "GG"], stock: 0, isActive: false, isNew: true,
        },
        update: { price: entry.price, metadata },
      }) : existing;
      if (!product) throw new Error(`Cadastre primeiro ${entry.name}.`);
      if (mode === "attach") {
        const photos = filenames.filter((filename) => filename.startsWith(entry.photoPrefix) && /\.(png|jpe?g|webp)$/i.test(filename)).sort();
        for (const [index, filename] of photos.entries()) {
          const url = `/images/products/${filename}`;
          const image = existing?.images.find((item) => item.url === url);
          if (index === 0) await tx.productImage.updateMany({ where: { productId: product.id, isPrimary: true }, data: { isPrimary: false } });
          const data = { url, alt: entry.name, isPrimary: index === 0, sortOrder: index };
          if (image) await tx.productImage.update({ where: { id: image.id }, data });
          else await tx.productImage.create({ data: { ...data, productId: product.id } });
        }
      }
      console.log(`${entry.name}: ${mode === "create" ? "cadastrado" : "fotos vinculadas"}; preço base R$ ${entry.price}; estoque ${product.stock}; ${product.isActive ? "ativo" : "inativo"}.`);
    }
  });
}
main().catch(() => {
  console.error("Não foi possível concluir o cadastro/vínculo. Verifique a conexão com o banco e os nomes das fotos. Nenhuma alteração parcial foi gravada.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
