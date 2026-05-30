"use client";

import { useActionState, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

import {
  saveProductAction,
  toggleProductStatusAction,
  type ProductFormState,
} from "@/app/admin/produtos/actions";
import { Button } from "@/components/shared/button";
import { siteConfig } from "@/lib/site";
import { formatCurrency } from "@/lib/utils";
import type { Product } from "@/types/store";

const initialState: ProductFormState = {
  status: "idle",
};

const emptyProduct = {
  id: "",
  name: "",
  slug: "",
  price: 0,
  description: "",
  category: "APPAREL",
  sizes: ["P", "M", "G", "GG"],
  stock: 0,
  featured: false,
  isNew: false,
  isActive: true,
  images: [],
} satisfies Product;

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
      {pending ? "Salvando..." : editing ? "Salvar alteracoes" : "Cadastrar produto"}
    </Button>
  );
}

function ProductStatusButton({ product }: { product: Product }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/60 transition hover:border-white/25 hover:text-white disabled:opacity-50"
    >
      {pending ? "Alterando..." : product.isActive ? "Inativar" : "Ativar"}
    </button>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/[0.45]">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "h-12 w-full rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-aaau-ember";

export function ProductAdminForm({ products }: { products: Product[] }) {
  const [state, formAction] = useActionState(saveProductAction, initialState);
  const [selectedId, setSelectedId] = useState("");

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedId) ?? emptyProduct,
    [products, selectedId],
  );
  const primaryImage =
    selectedProduct.images.find((image) => image.isPrimary)?.url ??
    selectedProduct.images[0]?.url ??
    "";
  const editing = Boolean(selectedId);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr),minmax(0,1.05fr)]">
      <section className="space-y-4 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">
              Cadastro
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              {editing ? "Editar produto" : "Novo produto"}
            </h2>
          </div>
          {editing ? (
            <Button variant="secondary" size="sm" onClick={() => setSelectedId("")}>
              Novo
            </Button>
          ) : null}
        </div>

        <form action={formAction} className="space-y-5">
          <input type="hidden" name="productId" value={selectedProduct.id} />

          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Nome">
              <input
                key={`name-${selectedProduct.id}`}
                name="name"
                required
                defaultValue={selectedProduct.name}
                className={inputClass}
                placeholder="Camiseta AAAU"
              />
            </FormField>
            <FormField label="Slug">
              <input
                key={`slug-${selectedProduct.id}`}
                name="slug"
                defaultValue={selectedProduct.slug}
                className={inputClass}
                placeholder="camiseta-aaau"
              />
            </FormField>
          </div>

          <FormField label="Descricao">
            <textarea
              key={`description-${selectedProduct.id}`}
              name="description"
              required
              rows={4}
              defaultValue={selectedProduct.description}
              className="w-full rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/25 focus:border-aaau-ember"
              placeholder="Resumo do produto, material, uso e detalhes importantes."
            />
          </FormField>

          <div className="grid gap-4 md:grid-cols-3">
            <FormField label="Preco">
              <input
                key={`price-${selectedProduct.id}`}
                name="price"
                required
                inputMode="decimal"
                defaultValue={selectedProduct.price || ""}
                className={inputClass}
                placeholder="79,90"
              />
            </FormField>
            <FormField label="Estoque">
              <input
                key={`stock-${selectedProduct.id}`}
                name="stock"
                required
                type="number"
                min={0}
                defaultValue={selectedProduct.stock}
                className={inputClass}
              />
            </FormField>
            <FormField label="Categoria">
              <select
                key={`category-${selectedProduct.id}`}
                name="category"
                defaultValue={selectedProduct.category}
                className={inputClass}
              >
                {Object.entries(siteConfig.categoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="Tamanhos / variacoes">
            <input
              key={`sizes-${selectedProduct.id}`}
              name="sizes"
              required
              defaultValue={selectedProduct.sizes.join(", ")}
              className={inputClass}
              placeholder="P, M, G, GG ou Unico"
            />
          </FormField>

          <FormField label="Imagem principal">
            <input
              key={`image-${selectedProduct.id}`}
              name="imageUrl"
              required
              defaultValue={primaryImage}
              className={inputClass}
              placeholder="/images/products/produto.svg"
            />
          </FormField>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["featured", "Destaque", selectedProduct.featured],
              ["isNew", "Lancamento", selectedProduct.isNew],
              ["isActive", "Ativo", selectedProduct.isActive],
            ].map(([name, label, checked]) => (
              <label
                key={String(name)}
                className="flex min-h-12 items-center gap-3 rounded-[1rem] border border-white/10 bg-black/20 px-4 text-sm text-white/70"
              >
                <input
                  key={`${name}-${selectedProduct.id}`}
                  name={String(name)}
                  type="checkbox"
                  defaultChecked={Boolean(checked)}
                  className="h-4 w-4 accent-aaau-ember"
                />
                {label}
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SubmitButton editing={editing} />
            {state.message ? (
              <p
                className={
                  state.status === "error"
                    ? "text-sm text-[#ff9a9a]"
                    : "text-sm text-[#b8e8c8]"
                }
              >
                {state.message}
              </p>
            ) : null}
          </div>
        </form>
      </section>

      <section className="space-y-4">
        {products.map((product) => {
          const image =
            product.images.find((entry) => entry.isPrimary)?.url ?? product.images[0]?.url;

          return (
            <article
              key={product.id}
              className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-white">{product.name}</p>
                    <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/50">
                      {product.isActive ? "Ativo" : "Inativo"}
                    </span>
                    {product.featured ? (
                      <span className="rounded-full border border-aaau-ember/40 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/70">
                        Destaque
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-white/55">{product.slug}</p>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-white/65">
                    {product.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs uppercase tracking-[0.16em] text-white/45">
                    <span>{siteConfig.categoryLabels[product.category]}</span>
                    <span>{formatCurrency(product.price)}</span>
                    <span>{product.stock} em estoque</span>
                    {image ? <span className="normal-case tracking-normal">{image}</span> : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setSelectedId(product.id)}>
                    Editar
                  </Button>
                  <form action={toggleProductStatusAction}>
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="isActive" value={String(!product.isActive)} />
                    <ProductStatusButton product={product} />
                  </form>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
