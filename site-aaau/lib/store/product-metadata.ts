import { z } from "zod";
import type { ProductMetadata, ProductVariant } from "@/types/store";

const moneySchema = z.coerce.number().finite().positive().max(99999999.99)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, "Use no máximo duas casas decimais.");
const variantsSchema = z.array(z.object({
  id: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  label: z.string().trim().min(1).max(120),
  price: z.preprocess((value) => typeof value === "string" ? value.replace(",", ".") : value, moneySchema),
})).max(20).superRefine((variants, ctx) => {
  if (new Set(variants.map((variant) => variant.id)).size !== variants.length ||
      new Set(variants.map((variant) => variant.label.toLocaleLowerCase("pt-BR"))).size !== variants.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "As opções precisam ter nomes e identificadores únicos." });
  }
});

export function buildProductMetadata(formData: FormData, existing: Record<string, unknown> = {}): Record<string, unknown> {
  const raw = formData.get("variants");
  const previous = (existing as ProductMetadata).variants ?? [];
  // Preserve legacy submissions and additional metadata (options, measurements, etc.).
  const submitted = raw === null ? previous.map((variant) => ({
    ...variant, price: formData.get(`variantPrice:${variant.id}`) ?? variant.price,
  })) : JSON.parse(String(raw));
  const result = variantsSchema.safeParse(submitted);
  if (!result.success) throw new Error(`Revise as opções: informe nome e preço positivo com até duas casas decimais. ${result.error.issues[0]?.message ?? ""}`);
  const variants: ProductVariant[] = result.data.map((variant) => ({
    ...previous.find((entry) => entry.id === variant.id), ...variant,
  }));
  return { ...existing, variants };
}
