"use client";

import { useState } from "react";

import { AddToCartButton } from "@/components/store/add-to-cart-button";
import { siteConfig } from "@/lib/site";
import { cn, formatCurrency } from "@/lib/utils";
import type { Product } from "@/types/store";

export function ProductPurchasePanel({ product }: { product: Product }) {
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>();
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [customName, setCustomName] = useState("");
  const [customNumber, setCustomNumber] = useState("");
  const requiresCustomization = product.requiresCustomization;
  const selectedVariant =
    product.variants?.find((variant) => variant.id === selectedVariantId);
  const displayPrice = selectedVariant?.price ?? product.price;
  const visibleOptions =
    product.options?.filter(
      (option) =>
        option.required &&
        (!product.variants?.length || selectedVariant?.requiredOptionIds?.includes(option.id)),
    ) ?? [];
  const selectedOption = visibleOptions[0];
  const selectedOptionValue = selectedOption?.values.find(
    (value) => value.id === selectedOptions[selectedOption.id],
  );
  const variantIsComplete = !product.variants?.length || Boolean(selectedVariant);
  const sizeIsComplete = product.sizes.length === 0 || Boolean(selectedSize);
  const optionsAreComplete = visibleOptions.every((option) => selectedOptions[option.id]);
  const customizationIsComplete =
    !requiresCustomization || (customName.trim().length > 0 && customNumber.trim().length > 0);
  const canAddToCart =
    variantIsComplete &&
    sizeIsComplete &&
    optionsAreComplete &&
    customizationIsComplete;
  const missingMessage = !variantIsComplete
    ? "Escolha uma opcao do produto."
    : !sizeIsComplete
      ? "Escolha um tamanho antes de adicionar ao carrinho."
      : !optionsAreComplete
        ? "Escolha todas as opcoes obrigatorias."
        : !customizationIsComplete
          ? "Preencha a personalizacao obrigatoria."
          : null;

  return (
    <div className="space-y-6 rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 sm:space-y-8 sm:p-6">
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
          {siteConfig.categoryLabels[product.category]}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-4xl uppercase tracking-[0.08em] text-white sm:text-5xl">
              {product.name}
            </h1>
            <p className="mt-3 text-sm leading-7 text-white/[0.68] sm:mt-4 sm:text-base sm:leading-8">
              {product.description}
            </p>
          </div>
          <span className="text-sm font-semibold uppercase tracking-[0.18em] text-aaau-sand">
            {formatCurrency(displayPrice)}
          </span>
        </div>
      </div>

      {product.variants?.length ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
            Opcao
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {product.variants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                onClick={() => {
                  setSelectedVariantId(variant.id);
                  setSelectedOptions((currentOptions) => {
                    const allowed = new Set(variant.requiredOptionIds ?? []);
                    return Object.fromEntries(
                      Object.entries(currentOptions).filter(([optionId]) =>
                        allowed.has(optionId),
                      ),
                    );
                  });
                }}
                className={cn(
                  "min-h-24 rounded-[1.2rem] border p-4 text-left transition",
                  selectedVariant?.id === variant.id
                    ? "border-aaau-ember bg-aaau-ember/15"
                    : "border-white/[0.12] bg-white/[0.03] hover:border-white/25",
                )}
              >
                <span className="block text-sm font-semibold uppercase tracking-[0.16em] text-white">
                  {variant.label}
                </span>
                {variant.description ? (
                  <span className="mt-2 block text-xs leading-5 text-white/[0.55]">
                    {variant.description}
                  </span>
                ) : null}
                <span className="mt-3 block text-sm font-semibold uppercase tracking-[0.16em] text-aaau-sand">
                  {formatCurrency(variant.price)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {visibleOptions.length ? (
        <div className="space-y-3">
          {visibleOptions.map((option) => (
            <div key={option.id} className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
                {option.label}
              </p>
              <div className="flex flex-wrap gap-3">
                {option.values.map((value) => (
                  <button
                    key={value.id}
                    type="button"
                    onClick={() =>
                      setSelectedOptions((currentOptions) => ({
                        ...currentOptions,
                        [option.id]: value.id,
                      }))
                    }
                    className={cn(
                      "inline-flex h-12 items-center gap-3 rounded-full border px-4 text-xs font-semibold uppercase tracking-[0.16em] transition",
                      selectedOptions[option.id] === value.id
                        ? "border-aaau-ember bg-aaau-ember text-white"
                        : "border-white/[0.12] bg-white/[0.03] text-white/70 hover:border-white/25",
                    )}
                  >
                    {value.swatch ? (
                      <span
                        className="h-4 w-4 rounded-full border border-white/25"
                        style={{ backgroundColor: value.swatch }}
                      />
                    ) : null}
                    {value.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
          Tamanho obrigatorio
        </p>
        <div className="flex flex-wrap gap-3">
          {product.sizes.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setSelectedSize(size)}
              className={cn(
                "rounded-full border px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] transition",
                selectedSize === size
                  ? "border-aaau-ember bg-aaau-ember text-white"
                  : "border-white/[0.12] bg-white/[0.03] text-white/70 hover:border-white/25",
              )}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      {requiresCustomization ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
            Personalizacao obrigatoria
          </p>
          <div className="grid gap-3 sm:grid-cols-[1fr,140px]">
            <label className="space-y-2">
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/[0.45]">
                Nome na peca *
              </span>
              <input
                value={customName}
                onChange={(event) => setCustomName(event.target.value.toUpperCase().slice(0, 18))}
                className="h-12 w-full rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 text-sm uppercase text-white outline-none placeholder:text-white/30 focus:border-aaau-ember"
                placeholder="Ex: GABI"
              />
            </label>
            <label className="space-y-2">
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/[0.45]">
                Numero *
              </span>
              <input
                inputMode="numeric"
                value={customNumber}
                onChange={(event) =>
                  setCustomNumber(event.target.value.replace(/\D/g, "").slice(0, 2))
                }
                className="h-12 w-full rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-aaau-ember"
                placeholder="10"
              />
            </label>
          </div>
          <p className="text-xs leading-6 text-white/[0.45]">
            Preencha nome e numero para adicionar este produto ao carrinho.
          </p>
        </div>
      ) : null}

      <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/[0.65]">
        <p className="font-semibold uppercase tracking-[0.18em] text-white/60">
          Politica inicial
        </p>
        <p className="mt-2">{siteConfig.policyNote}</p>
      </div>

      <AddToCartButton
        product={product}
        defaultSize={selectedSize}
        variantId={selectedVariant?.id}
        variantLabel={selectedVariant?.label}
        variantPrice={selectedVariant?.price}
        optionId={selectedOption?.id}
        optionLabel={selectedOption?.label}
        optionValueId={selectedOptionValue?.id}
        optionValueLabel={selectedOptionValue?.label}
        customName={customName}
        customNumber={customNumber}
        disabled={!canAddToCart}
      />
      {missingMessage ? <p className="text-sm text-[#ffb4b4]">{missingMessage}</p> : null}
    </div>
  );
}
