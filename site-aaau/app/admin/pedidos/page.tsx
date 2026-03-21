import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/admin-shell";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getOrders } from "@/lib/data/store";

export const metadata: Metadata = {
  title: "Admin Pedidos",
};

export default async function AdminOrdersPage() {
  const orders = await getOrders();

  return (
    <AdminShell
      activeHref="/admin/pedidos"
      title="Pedidos"
      description="Visão inicial para acompanhamento do fluxo comercial da atlética."
    >
      <div className="space-y-4">
        {orders.map((order) => (
          <article
            key={order.id}
            className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-5"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="font-semibold text-white">{order.orderNumber}</p>
                <p className="text-sm text-white/60">
                  {order.customerName} • {order.customerPhone} • {formatDate(order.createdAt)}
                </p>
              </div>
              <div className="text-left md:text-right">
                <p className="text-xs uppercase tracking-[0.18em] text-white/[0.45]">
                  {order.status}
                </p>
                <p className="mt-1 font-semibold text-aaau-sand">
                  {formatCurrency(order.total)}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4 text-sm text-white/70"
                >
                  <p className="font-semibold text-white">{item.productName}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/[0.45]">
                    {item.size} • {item.quantity}x
                  </p>
                  <p className="mt-3">{formatCurrency(item.lineTotal)}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </AdminShell>
  );
}
