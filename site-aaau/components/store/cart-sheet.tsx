"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, X } from "lucide-react";

import { buttonVariants } from "@/components/shared/button";
import { useCart } from "@/features/cart/cart-provider";
import { cn, formatCurrency } from "@/lib/utils";

export function CartSheet() {
  const {
    items,
    isOpen,
    subtotal,
    total,
    discount,
    closeCart,
    updateQuantity,
    removeItem,
  } = useCart();

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 transition",
        isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
      )}
      aria-hidden={!isOpen}
    >
      <button
        type="button"
        onClick={closeCart}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Fechar carrinho"
      />
      <aside
        className={cn(
          "absolute right-0 top-0 flex h-full w-full max-w-lg flex-col border-l border-white/10 bg-[#0c0c0c] p-5 transition duration-300 sm:p-6",
          isOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
              Carrinho
            </p>
            <h3 className="font-display text-3xl uppercase tracking-[0.08em] text-white">
              Pedido atual
            </h3>
          </div>

          <button
            type="button"
            onClick={closeCart}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto py-5">
          {items.length === 0 ? (
            <div className="rounded-[1.6rem] border border-dashed border-white/[0.15] bg-white/[0.03] p-6 text-sm leading-7 text-white/[0.65]">
              O carrinho está vazio. Adicione um produto para iniciar o pedido.
            </div>
          ) : (
            items.map((item) => (
              <article
                key={`${item.productId}-${item.size}`}
                className="grid grid-cols-[88px,1fr] gap-4 rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="relative aspect-square overflow-hidden rounded-[1rem] bg-white/5">
                  <Image src={item.image} alt={item.name} fill className="object-cover" />
                </div>
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-white">{item.name}</p>
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

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center rounded-full border border-white/10 bg-black/20">
                      <button
                        type="button"
                        onClick={() =>
                          updateQuantity(item.productId, item.size, item.quantity - 1)
                        }
                        className="inline-flex h-9 w-9 items-center justify-center text-white"
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
                        className="inline-flex h-9 w-9 items-center justify-center text-white"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    <p className="text-sm font-semibold uppercase tracking-[0.14em] text-aaau-sand">
                      {formatCurrency(item.price * item.quantity)}
                    </p>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>

        <div className="space-y-3 border-t border-white/10 pt-4 text-sm text-white/70">
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

          <div className="grid gap-3 pt-3 sm:grid-cols-2">
            <Link
              href="/carrinho"
              className={buttonVariants({
                variant: "secondary",
                className: "w-full",
              })}
              onClick={closeCart}
            >
              Revisar
            </Link>
            <Link
              href="/checkout"
              className={buttonVariants({
                variant: "primary",
                className: "w-full",
              })}
              onClick={closeCart}
            >
              Checkout
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
