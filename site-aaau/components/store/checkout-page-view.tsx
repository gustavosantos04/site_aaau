"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/shared/button";
import { useCart } from "@/features/cart/cart-provider";
import { siteConfig } from "@/lib/site";
import { formatCurrency } from "@/lib/utils";

export function CheckoutPageView() {
  const router = useRouter();
  const { items, subtotal, discount, total, clearCart } = useCart();
  const [loading, setLoading] = useState(false);

  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
      <div className="max-w-2xl space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
          Checkout
        </p>
        <h1 className="font-display text-4xl uppercase tracking-[0.08em] text-white sm:text-5xl">
          Finalizacao preparada para expansao.
        </h1>
        <p className="text-base leading-7 text-white/[0.68]">
          Fluxo base pronto para futura integracao com Mercado Pago, enquanto a
          confirmacao inicial seguira por WhatsApp.
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:mt-10 lg:grid-cols-[1fr,420px] lg:gap-8">
        <form
          className="space-y-6 rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (items.length === 0) {
              return;
            }
            setLoading(true);
            window.setTimeout(() => {
              clearCart();
              router.push("/pedido/confirmado");
            }, 800);
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">
                Nome
              </span>
              <input
                required
                className="h-12 w-full rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 text-sm text-white outline-none focus:border-aaau-ember"
                placeholder="Nome completo"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">
                WhatsApp
              </span>
              <input
                required
                className="h-12 w-full rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 text-sm text-white outline-none focus:border-aaau-ember"
                placeholder="(51) 99999-0000"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">
                E-mail
              </span>
              <input
                type="email"
                required
                className="h-12 w-full rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 text-sm text-white outline-none focus:border-aaau-ember"
                placeholder="voce@exemplo.com"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">
                Campus / sede
              </span>
              <select className="h-12 w-full rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 text-sm text-white outline-none focus:border-aaau-ember">
                <option>Zona Sul</option>
                <option>FAPA</option>
                <option>Canoas</option>
              </select>
            </label>
          </div>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">
              Observacoes
            </span>
            <textarea
              rows={4}
              className="w-full rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-aaau-ember"
              placeholder="Preferencia de entrega, turma, atleta responsavel..."
            />
          </label>

          <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/[0.65]">
            {siteConfig.policyNote}
          </div>

          <Button size="lg" className="w-full" disabled={items.length === 0 || loading}>
            {loading ? "Processando..." : "Confirmar pedido base"}
          </Button>
        </form>

        <aside className="h-fit rounded-[2rem] border border-white/10 bg-black/20 p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
            Resumo do pedido
          </p>
          <p className="mt-3 font-display text-4xl uppercase tracking-[0.08em] text-white">
            {itemCount} itens
          </p>

          <div className="mt-8 space-y-4">
            {items.map((item) => (
              <div
                key={`${item.productId}-${item.size}`}
                className="flex items-start justify-between gap-4 border-b border-white/10 pb-4 text-sm text-white/70"
              >
                <div>
                  <p className="font-semibold text-white">{item.name}</p>
                  <p className="text-xs uppercase tracking-[0.18em] text-white/[0.45]">
                    {item.size} • {item.quantity}x
                  </p>
                </div>
                <span>{formatCurrency(item.price * item.quantity)}</span>
              </div>
            ))}
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
        </aside>
      </div>
    </section>
  );
}
