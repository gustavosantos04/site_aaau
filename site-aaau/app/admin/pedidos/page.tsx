import Link from "next/link";
import type { Route } from "next";
import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminSession } from "@/lib/auth";
import { getOrders } from "@/lib/data/store";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { OrderData, OrderStatus } from "@/types/store";

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
              {status === "ALL" ? "Todos os status" : status}
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
            className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-white">{order.orderNumber}</p>
                <p className="mt-1 text-sm text-white/60">
                  {order.customerName} - {formatDate(order.createdAt)}
                </p>
                <p className="mt-2 text-sm text-white/50">
                  {order.customerCpf ?? "CPF nao informado"} - {order.customerEmail} -{" "}
                  {order.customerPhone}
                </p>
                <p className="mt-1 text-sm text-white/50">
                  Campus: {order.customerCampus ?? "Nao informado"}
                </p>
              </div>
              <div className="text-left md:text-right">
                <p className="text-xs uppercase tracking-[0.18em] text-white/[0.45]">
                  Pedido: {order.status}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/[0.45]">
                  Pagamento: {order.paymentStatus ?? "PENDING"}
                </p>
                <p className="mt-2 font-semibold text-aaau-sand">{formatCurrency(order.total)}</p>
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
