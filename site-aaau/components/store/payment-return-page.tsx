"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { buttonVariants } from "@/components/shared/button";
import { formatCurrency, formatDate } from "@/lib/utils";

type PublicOrder = {
  orderId: string;
  orderNumber: string;
  status: "pending" | "approved" | "rejected" | "cancelled" | "refunded" | "expired";
  items: Array<{
    id: string;
    productName: string;
    size: string | null;
    quantity: number;
    totalPrice: number;
  }>;
  total: number;
  buyer: {
    name: string;
  };
  createdAt: string;
};

const content = {
  success: {
    eyebrow: "Pagamento",
    title: "Pedido recebido.",
    copy:
      "A AAAU recebeu seu pedido. Assim que o pagamento for confirmado, você receberá um email de confirmação.",
  },
  pending: {
    eyebrow: "Pagamento pendente",
    title: "Pagamento em processamento.",
    copy:
      "Estamos aguardando a confirmação do Mercado Pago. Esta página atualiza sozinha e você receberá um email quando o pagamento for aprovado.",
  },
  error: {
    eyebrow: "Pagamento nao concluido",
    title: "Não recebemos a confirmação.",
    copy:
      "O pedido continua salvo como pendente ou recusado. Você pode voltar ao catálogo e iniciar uma nova tentativa de pagamento.",
  },
};

const statusLabels: Record<PublicOrder["status"], string> = {
  approved: "Pagamento aprovado",
  pending: "Aguardando confirmação",
  rejected: "Pagamento recusado",
  cancelled: "Pagamento cancelado",
  refunded: "Pagamento estornado",
  expired: "Pagamento expirado",
};

export function PaymentReturnPage({
  orderId,
  variant,
}: {
  orderId?: string;
  variant: keyof typeof content;
}) {
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [loading, setLoading] = useState(Boolean(orderId));
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const page = content[variant];

  useEffect(() => {
    if (!orderId) {
      setMessage("Pedido nao informado.");
      setLoading(false);
      return;
    }

    let active = true;

    async function fetchOrder(isRefresh = false) {
      if (isRefresh) {
        setRefreshing(true);
      }

      fetch(`/api/orders/${orderId}`)
        .then(async (response) => {
          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.message ?? "Pedido nao encontrado.");
          }

          if (active) {
            setOrder(result as PublicOrder);
            setMessage(null);
          }
        })
        .catch((error) => {
          if (active) {
            setMessage(error instanceof Error ? error.message : "Não foi possível buscar o pedido.");
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false);
            setRefreshing(false);
          }
        });
    }

    fetchOrder();
    const intervalId = window.setInterval(() => fetchOrder(true), 5000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [orderId]);

  return (
    <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
          {page.eyebrow}
        </p>
        <h1 className="mt-4 font-display text-4xl uppercase tracking-[0.08em] text-white sm:text-6xl">
          {page.title}
        </h1>
        <p className="mt-5 text-base leading-8 text-white/[0.68]">{page.copy}</p>
      </div>

      <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        {loading ? <p className="text-sm text-white/60">Buscando pedido...</p> : null}
        {message ? <p className="text-sm text-[#ffb4b4]">{message}</p> : null}

        {order ? (
          <div className="grid gap-6 lg:grid-cols-[1fr,280px]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/[0.45]">
                {order.orderNumber} - {formatDate(order.createdAt)}
              </p>
              <p className="mt-3 text-sm text-white/65">
                Comprador: {order.buyer.name} - Status: {statusLabels[order.status]}
              </p>
              {order.status === "pending" ? (
                <p className="mt-2 text-sm text-white/55">
                  Aguardando retorno do Mercado Pago. {refreshing ? "Atualizando..." : null}
                </p>
              ) : null}
              <div className="mt-5 space-y-3">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-4 border-b border-white/10 pb-3 text-sm text-white/70"
                  >
                    <div>
                      <p className="font-semibold text-white">{item.productName}</p>
                      <p className="text-xs uppercase tracking-[0.16em] text-white/[0.45]">
                        {item.size ?? "Sem tamanho"} - {item.quantity}x
                      </p>
                    </div>
                    <span>{formatCurrency(item.totalPrice)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[1.2rem] border border-white/10 bg-black/20 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/[0.45]">
                Total
              </p>
              <p className="mt-3 font-display text-4xl uppercase tracking-[0.08em] text-white">
                {formatCurrency(order.total)}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/produtos" className={buttonVariants({ variant: "primary", size: "lg" })}>
          Voltar ao catálogo
        </Link>
        <Link href="/" className={buttonVariants({ variant: "secondary", size: "lg" })}>
          Ir para home
        </Link>
      </div>
    </section>
  );
}
