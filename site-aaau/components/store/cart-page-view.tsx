"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Ticket } from "lucide-react";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/shared/button";
import { useCart } from "@/features/cart/cart-provider";
import { formatCurrency } from "@/lib/utils";
import { siteConfig } from "@/lib/site";

export function CartPageView() {
  const {
    items,
    subtotal,
    discount,
    total,
    couponCode,
    applyCoupon,
    updateQuantity,
    removeItem,
  } = useCart();
  const [couponInput, setCouponInput] = useState(couponCode);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);

  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-2xl space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
          Carrinho
        </p>
        <h1 className="font-display text-5xl uppercase tracking-[0.08em] text-white">
          Revise seu pedido.
        </h1>
        <p className="text-base leading-7 text-white/[0.68]">
          Ajuste quantidades, aplique o cupom e avance para o checkout.
        </p>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.05fr,0.95fr]">
        <div className="space-y-4">
          {items.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-white/[0.15] bg-white/[0.03] p-8 text-white/[0.68]">
              <p className="text-lg font-semibold text-white">Nenhum item no carrinho.</p>
              <p className="mt-2 text-sm leading-7">
                Vá para o catálogo e monte o primeiro pedido da coleção AAAU.
              </p>
              <Link
                href="/produtos"
                className={buttonVariants({
                  variant: "primary",
                  size: "lg",
                  className: "mt-6",
                })}
              >
                Ir para produtos
              </Link>
            </div>
          ) : (
            items.map((item) => (
              <article
                key={`${item.productId}-${item.size}`}
                className="grid gap-4 rounded-[2rem] border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-[120px,1fr]"
              >
                <div className="relative aspect-square overflow-hidden rounded-[1.4rem] bg-white/5">
                  <Image src={item.image} alt={item.name} fill className="object-cover" />
                </div>
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-white">{item.name}</h2>
                      <p className="text-xs uppercase tracking-[0.18em] text-white/[0.45]">
                        Tamanho {item.size}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.productId, item.size)}
                      className="text-xs uppercase tracking-[0.18em] text-white/[0.45]"
                    >
                      Remover
                    </button>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center rounded-full border border-white/10 bg-black/20">
                      <button
                        type="button"
                        onClick={() =>
                          updateQuantity(item.productId, item.size, item.quantity - 1)
                        }
                        className="inline-flex h-10 w-10 items-center justify-center text-white"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="min-w-10 text-center text-sm text-white">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateQuantity(item.productId, item.size, item.quantity + 1)
                        }
                        className="inline-flex h-10 w-10 items-center justify-center text-white"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-aaau-sand">
                      {formatCurrency(item.price * item.quantity)}
                    </p>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>

        <aside className="h-fit rounded-[2rem] border border-white/10 bg-black/20 p-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
              Resumo
            </p>
            <h2 className="font-display text-4xl uppercase tracking-[0.08em] text-white">
              {itemCount} itens
            </h2>
          </div>

          <div className="mt-8 space-y-3 border-t border-white/10 pt-6 text-sm text-white/70">
            <div className="flex items-center justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Desconto</span>
              <span>{formatCurrency(discount)}</span>
            </div>
            <div className="flex items-center justify-between text-base font-semibold uppercase tracking-[0.18em] text-white">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-3">
              <Ticket className="h-4 w-4 text-aaau-sand" />
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/50">
                Cupom
              </p>
            </div>

            <div className="mt-4 flex gap-3">
              <input
                value={couponInput}
                onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
                placeholder="GESTAO"
                className="h-12 flex-1 rounded-full border border-white/[0.12] bg-black/20 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-aaau-ember"
              />
              <Button
                variant="secondary"
                onClick={() => {
                  const valid = applyCoupon(couponInput);
                  setCouponMessage(
                    valid ? "Cupom aplicado com sucesso." : "Cupom inválido.",
                  );
                }}
              >
                Aplicar
              </Button>
            </div>

            {couponMessage ? (
              <p className="mt-3 text-xs uppercase tracking-[0.18em] text-white/[0.45]">
                {couponMessage}
              </p>
            ) : null}
          </div>

          <div className="mt-8 space-y-4">
            <p className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-white/[0.65]">
              {siteConfig.policyNote}
            </p>
            <Link
              href="/checkout"
              className={buttonVariants({
                variant: "primary",
                size: "lg",
                className: "w-full",
              })}
            >
              Ir para checkout
            </Link>
          </div>
        </aside>
      </div>
    </section>
  );
}
