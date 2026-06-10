import Link from "next/link";
import type { Route } from "next";
import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminSession } from "@/lib/auth";
import { getOrders } from "@/lib/data/store";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { OrderData, OrderStatus, PaymentStatus } from "@/types/store";

export const metadata: Metadata = {
  title: "Admin Pedidos",
};

const statuses: Array<OrderStatus | "ALL"> = [
  "ALL",
  "PENDING",
  "PAID",
  "CONTACT_PENDING",
  "CONFIRMED",
  "FULFILLED",
  "CANCELED",
  "FAILED",
];

const orderStatusLabels: Record<OrderStatus | "ALL", string> = {
  ALL: "Todos",
  PENDING: "Pedido pendente",
  CONTACT_PENDING: "Aguardando contato",
  CONFIRMED: "Confirmado",
  PAID: "Pago",
  FULFILLED: "Entregue",
  CANCELED: "Cancelado",
  FAILED: "Falhou",
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  PENDING: "Pagamento pendente",
  APPROVED: "Pagamento aprovado",
  REJECTED: "Pagamento recusado",
  CANCELED: "Pagamento cancelado",
  REFUNDED: "Reembolsado",
  EXPIRED: "Expirado",
  UNKNOWN: "Status desconhecido",
};

function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const toneClass = {
    neutral: "border-white/10 bg-white/[0.04] text-white/60",
    good: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
    warn: "border-aaau-sand/30 bg-aaau-sand/10 text-aaau-sand",
    bad: "border-red-400/30 bg-red-400/10 text-red-100",
  }[tone];

  return (
    <span className={`inline-flex rounded-full border px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] ${toneClass}`}>
      {label}
    </span>
  );
}

function orderTone(status: OrderStatus) {
  if (status === "PAID" || status === "FULFILLED" || status === "CONFIRMED") return "good";
  if (status === "CANCELED" || status === "FAILED") return "bad";
  return "warn";
}

function paymentTone(status?: PaymentStatus) {
  if (status === "APPROVED") return "good";
  if (status === "REJECTED" || status === "CANCELED" || status === "EXPIRED") return "bad";
  return "warn";
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\D/g, "");
}

function matchesSearch(order: OrderData, search: string) {
  if (!search) {
    return true;
  }

  const term = search.toLowerCase();
  const digits = normalize(search);
  const values = [
    order.customerName,
    order.customerCpf ?? "",
    order.customerEmail,
    order.customerPhone,
    order.customerCampus ?? "",
    order.orderNumber,
  ];

  return values.some((value) => {
    const lower = value.toLowerCase();
    return lower.includes(term) || (digits ? normalize(value).includes(digits) : false);
  });
}

function whatsappLink(order: OrderData) {
  const digits = order.customerPhone.replace(/\D/g, "");
  const phone = digits.startsWith("55") ? digits : `55${digits}`;
  const text = encodeURIComponent(`Oi, ${order.customerName}! Aqui e a AAAU sobre o pedido ${order.orderNumber}.`);

  return `https://wa.me/${phone}?text=${text}`;
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; busca?: string }>;
}) {
  await requireAdminSession();

  const params = await searchParams;
  const selectedStatus = statuses.includes(params.status as OrderStatus) ? params.status : "ALL";
  const search = params.busca?.trim() ?? "";
  const orders = (await getOrders()).filter(
    (order) =>
      (selectedStatus === "ALL" || order.status === selectedStatus) &&
      matchesSearch(order, search),
  );
  const exportHref = `/admin/pedidos/export?status=${selectedStatus}&busca=${encodeURIComponent(search)}`;

  return (
    <AdminShell
      activeHref="/admin/pedidos"
      title="Pedidos"
      description="Acompanhe compradores, itens, status do pedido e status do pagamento."
    >
      <form className="grid gap-3 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-[1fr,220px,auto] sm:p-5">
        <input
          name="busca"
          defaultValue={search}
          placeholder="Buscar por nome, CPF, email ou WhatsApp"
          className="h-12 rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-aaau-ember"
        />
        <select
          name="status"
          defaultValue={selectedStatus}
          className="h-12 rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 text-sm text-white outline-none focus:border-aaau-ember"
        >
          {statuses.map((status) => (
            <option key={status} value={status}>
              {orderStatusLabels[status]}
            </option>
          ))}
        </select>
        <button className="h-12 rounded-full border border-aaau-ember bg-aaau-ember px-5 text-sm font-semibold uppercase tracking-[0.16em] text-white">
          Filtrar
        </button>
      </form>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-white/55">{orders.length} pedidos encontrados.</p>
        <Link
          href={exportHref as Route}
          className="inline-flex h-10 items-center justify-center rounded-full border border-white/10 px-4 text-xs font-semibold uppercase tracking-[0.16em] text-white/65 transition hover:border-white/25 hover:text-white"
        >
          Exportar CSV
        </Link>
      </div>

      <div className="space-y-4">
        {orders.map((order) => (
          <article
            key={order.id}
            className="rounded-[1.5rem] border border-white/10 bg-[#101010] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.24)]"
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-4">
                <div>
                  <p className="font-semibold text-white">{order.orderNumber}</p>
                  <p className="mt-1 text-sm text-white/60">
                    {order.customerName} - {formatDate(order.createdAt)}
                  </p>
                </div>
                <div className="grid gap-2 text-sm text-white/52 sm:grid-cols-2">
                  <p>{order.customerCpf ?? "CPF nao informado"}</p>
                  <p>{order.customerEmail}</p>
                  <p>{order.customerPhone}</p>
                  <p>Campus: {order.customerCampus ?? "Nao informado"}</p>
                </div>
              </div>
              <div className="shrink-0 space-y-3 text-left lg:text-right">
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <StatusBadge label={orderStatusLabels[order.status]} tone={orderTone(order.status)} />
                  <StatusBadge
                    label={paymentStatusLabels[order.paymentStatus ?? "PENDING"]}
                    tone={paymentTone(order.paymentStatus)}
                  />
                </div>
                <p className="text-2xl font-semibold text-aaau-sand">
                  {formatCurrency(order.total)}
                </p>
                <a
                  href={whatsappLink(order)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex h-10 items-center rounded-full border border-white/10 px-4 text-xs font-semibold uppercase tracking-[0.16em] text-white/65 transition hover:border-white/25 hover:text-white"
                >
                  WhatsApp
                </a>
              </div>
            </div>

            <details className="mt-5 rounded-[1.2rem] border border-white/10 bg-black/20 p-4">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
                Ver detalhes
              </summary>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[1rem] border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70"
                  >
                    <p className="font-semibold text-white">{item.productName}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-white/[0.45]">
                      {item.size ?? "Sem variacao"} - {item.quantity}x
                    </p>
                    {item.customName || item.customNumber ? (
                      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-white/[0.45]">
                        {item.customName ? `Nome ${item.customName}` : null}
                        {item.customName && item.customNumber ? " - " : null}
                        {item.customNumber ? `Numero ${item.customNumber}` : null}
                      </p>
                    ) : null}
                    <p className="mt-3">{formatCurrency(item.lineTotal)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-2 text-sm text-white/55">
                <p>Preference ID: {order.mercadoPagoPreferenceId ?? "Nao criado"}</p>
                <p>Payment ID: {order.mercadoPagoPaymentId ?? "Nao recebido"}</p>
                {order.notes ? <p>Observacoes: {order.notes}</p> : null}
              </div>
            </details>
          </article>
        ))}
      </div>
    </AdminShell>
  );
}
