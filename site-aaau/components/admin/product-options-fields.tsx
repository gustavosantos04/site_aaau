"use client";

import { useState } from "react";
import type { Product } from "@/types/store";
import { Button } from "@/components/shared/button";

const inputClass = "h-12 w-full rounded-[1rem] border border-white/10 bg-black/20 px-4 text-sm text-white";

export function ProductOptionsFields({ product }: { product: Product }) {
  const [variants, setVariants] = useState(() => (product.variants ?? []).map((variant) => ({
    id: variant.id, label: variant.label, price: String(variant.price),
  })));
  const [sizesText, setSizesText] = useState(product.sizes.join(", "));
  const sizes = [...new Set(sizesText.split(",").map((size) => size.trim()).filter(Boolean))];
  return <>
    <label className="block space-y-2 text-sm text-white/70">
      Tamanhos disponíveis
      <input name="sizes" required value={sizesText} onChange={(event) => setSizesText(event.target.value)} className={inputClass} placeholder="P, M, G, GG ou Único" />
    </label>
    <div className="space-y-3 rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
      <p className="text-sm text-white/70">Opções com preços diferentes (opcional)</p>
      <p className="text-xs text-white/40">Sem opções, o produto usa o preço de venda. Com opções, a escolha é obrigatória e o preço base será o menor preço cadastrado.</p>
      <input type="hidden" name="variants" value={JSON.stringify(variants)} />
      {variants.map((variant, index) => <div key={variant.id} className="grid gap-2 sm:grid-cols-[1fr,120px,auto]">
        <label className="text-xs text-white/70">Nome da opção
          <input aria-label={`Nome da opção ${index + 1}`} required maxLength={120} value={variant.label} className={inputClass} onChange={(event) => setVariants((rows) => rows.map((row) => row.id === variant.id ? { ...row, label: event.target.value } : row))} />
        </label>
        <label className="text-xs text-white/70">Preço (R$)
          <input aria-label={`Preço da opção ${index + 1}`} required inputMode="decimal" value={variant.price} className={inputClass} onChange={(event) => setVariants((rows) => rows.map((row) => row.id === variant.id ? { ...row, price: event.target.value } : row))} />
        </label>
        <Button type="button" variant="secondary" aria-label={`Remover opção ${index + 1}`} onClick={() => setVariants((rows) => rows.filter((row) => row.id !== variant.id))}>Remover</Button>
      </div>)}
      <Button type="button" variant="secondary" disabled={variants.length >= 20} onClick={() => setVariants((rows) => [...rows, { id: crypto.randomUUID(), label: "", price: "" }])}>Adicionar opção</Button>
    </div>
    <div className="space-y-3 rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
      <label className="flex items-center gap-3 text-sm text-white/70">
        <input type="checkbox" name="trackDetailedStock" defaultChecked={Boolean(product.stockItems?.length)} className="h-4 w-4 accent-aaau-ember" />
        Controlar estoque por opção e tamanho
      </label>
      <p className="text-xs text-white/40">Ao marcar, cada combinação abaixo vira a fonte de verdade. Zero significa esgotado.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(variants.length ? variants : [{ id: "", label: "Produto" }]).flatMap((variant) => sizes.map((size) => {
          const saved = product.stockItems?.find((item) => item.variantId === variant.id && item.size === size);
          return <label key={`${variant.id}-${size}`} className="space-y-2 text-xs text-white/70">{variant.label || "Nova opção"} / {size}
            <input aria-label={`Estoque ${variant.label || "Nova opção"} / ${size}`} className={inputClass} type="number" min={0} name={`stockItem:${encodeURIComponent(variant.id)}:${encodeURIComponent(size)}`} defaultValue={saved?.stock ?? 0} />
          </label>;
        }))}
      </div>
    </div>
  </>;
}
