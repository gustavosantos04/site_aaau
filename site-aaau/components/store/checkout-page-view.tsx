"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/shared/button";
import { useCart } from "@/features/cart/cart-provider";
import { siteConfig } from "@/lib/site";
import { formatCurrency } from "@/lib/utils";

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatWhatsapp(value: string) {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  }

  return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

export function CheckoutPageView() {
  const router = useRouter();
  const { items, subtotal, discount, total, clearCart } = useCart();
  const [loading, setLoading] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [buyerCpf, setBuyerCpf] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerWhatsapp, setBuyerWhatsapp] = useState("");
  const [buyerCampus, setBuyerCampus] = useState("Zona Sul");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (items.length === 0) {
      setMessage("Adicione ao menos um produto ao carrinho.");
      return;
    }

    if (onlyDigits(buyerCpf).length !== 11) {
      setMessage("Informe um CPF valido.");
      return;
    }

    if (onlyDigits(buyerWhatsapp).length < 10) {
      setMessage("Informe um WhatsApp valido.");
      return;
    }

    setLoading(true);

    try {
      const idempotencyKey =
        window.sessionStorage.getItem("aaau-checkout-key") ?? crypto.randomUUID();
      window.sessionStorage.setItem("aaau-checkout-key", idempotencyKey);

      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idempotencyKey,
          notes,
          buyer: {
            fullName: buyerName,
            cpf: buyerCpf,
            email: buyerEmail,
            whatsapp: buyerWhatsapp,
            campus: buyerCampus,
          },
          items: items.map((item) => ({
            productId: item.productId,
            size: item.size || undefined,
            variantId: item.variantId,
            optionId: item.optionId,
            optionValueId: item.optionValueId,
            customName: item.customName,
            customNumber: item.customNumber,
            quantity: item.quantity,
          })),
        }),
      });
      const result = (await response.json()) as {
        message?: string;
        orderId?: string;
        initPoint?: string | null;
      };

      if (!response.ok) {
        throw new Error(result.message ?? "Não foi possível criar o pedido.");
      }

      clearCart();
      window.sessionStorage.removeItem("aaau-checkout-key");

      if (result.initPoint) {
        window.location.href = result.initPoint;
        return;
      }

      router.push(`/pagamento/pendente?orderId=${result.orderId ?? ""}` as Route);
    } catch (error) {
      window.sessionStorage.removeItem("aaau-checkout-key");
      setMessage(error instanceof Error ? error.message : "Erro ao iniciar pagamento.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="max-w-2xl space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
          Checkout
        </p>
        <h1 className="font-display text-4xl uppercase tracking-[0.08em] text-white sm:text-5xl">
          Dados para pagamento.
        </h1>
        <p className="text-base leading-7 text-white/[0.68]">
          Preencha os dados obrigatórios para criar o pedido pendente e iniciar o checkout Mercado
          Pago.
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:mt-10 lg:grid-cols-[1fr,420px] lg:gap-8">
        <form
          className="space-y-6 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5 sm:p-6"
          onSubmit={submitCheckout}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/[0.45]">
                Nome completo
              </span>
              <input
                required
                value={buyerName}
                onChange={(event) => setBuyerName(event.target.value)}
                className="h-12 w-full rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 text-sm text-white outline-none focus:border-aaau-ember"
                placeholder="Nome e sobrenome"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/[0.45]">
                CPF
              </span>
              <input
                required
                inputMode="numeric"
                value={buyerCpf}
                onChange={(event) => setBuyerCpf(formatCpf(event.target.value))}
                className="h-12 w-full rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 text-sm text-white outline-none focus:border-aaau-ember"
                placeholder="000.000.000-00"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/[0.45]">
                E-mail
              </span>
              <input
                type="email"
                required
                value={buyerEmail}
                onChange={(event) => setBuyerEmail(event.target.value)}
                className="h-12 w-full rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 text-sm text-white outline-none focus:border-aaau-ember"
                placeholder="voce@exemplo.com"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/[0.45]">
                WhatsApp
              </span>
              <input
                required
                inputMode="tel"
                value={buyerWhatsapp}
                onChange={(event) => setBuyerWhatsapp(formatWhatsapp(event.target.value))}
                className="h-12 w-full rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 text-sm text-white outline-none focus:border-aaau-ember"
                placeholder="(51) 99999-0000"
              />
            </label>
          </div>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/[0.45]">
              Campus
            </span>
            <select
              required
              value={buyerCampus}
              onChange={(event) => setBuyerCampus(event.target.value)}
              className="h-12 w-full rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 text-sm text-white outline-none focus:border-aaau-ember"
            >
              <option>Zona Sul</option>
              <option>FAPA</option>
              <option>Canoas</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/[0.45]">
              Observacoes
            </span>
            <textarea
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="w-full rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-aaau-ember"
              placeholder="Preferencia de entrega, turma, atleta responsavel..."
            />
          </label>

          <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/[0.65]">
            {siteConfig.policyNote}
          </div>

          {message ? <p className="text-sm text-[#ffb4b4]">{message}</p> : null}

          <Button type="submit" size="lg" className="w-full" disabled={items.length === 0 || loading}>
            {loading ? "Criando pedido..." : "Iniciar pagamento"}
          </Button>
        </form>

        <aside className="h-fit rounded-[1.5rem] border border-white/10 bg-black/20 p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
            Resumo do pedido
          </p>
          <p className="mt-3 font-display text-4xl uppercase tracking-[0.08em] text-white">
            {itemCount} itens
          </p>

          <div className="mt-8 space-y-4">
            {items.map((item) => (
              <div
                key={`${item.productId}-${item.size}-${item.variantId ?? ""}-${item.optionValueId ?? ""}-${item.customName ?? ""}-${item.customNumber ?? ""}`}
                className="flex items-start justify-between gap-4 border-b border-white/10 pb-4 text-sm text-white/70"
              >
                <div>
                  <p className="font-semibold text-white">{item.name}</p>
                  <p className="text-xs uppercase tracking-[0.18em] text-white/[0.45]">
                    {item.size} - {item.quantity}x
                  </p>
                  {item.optionLabel && item.optionValueLabel ? (
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-white/[0.45]">
                      {item.optionLabel} {item.optionValueLabel}
                    </p>
                  ) : null}
                  {item.customName || item.customNumber ? (
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-white/[0.45]">
                      {item.customName ? `Nome ${item.customName}` : null}
                      {item.customName && item.customNumber ? " - " : null}
                      {item.customNumber ? `Numero ${item.customNumber}` : null}
                    </p>
                  ) : null}
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
