import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/admin-shell";
import { SummaryCard } from "@/components/admin/summary-card";
import { requireAdminSession } from "@/lib/auth";
import { getDashboardSnapshot, getOrders, getProducts } from "@/lib/data/store";
import { formatCurrency, formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Admin",
};

export default async function AdminDashboardPage() {
  await requireAdminSession();

  const [snapshot, orders, products] = await Promise.all([
    getDashboardSnapshot(),
    getOrders(),
    getProducts(),
  ]);

  return (
    <AdminShell
      activeHref="/admin"
      title="Painel"
      description="Visão geral da operação inicial da loja, pedidos e catálogo."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Produtos" value={snapshot.totalProducts} helper="Itens ativos na base." />
        <SummaryCard label="Pedidos" value={snapshot.activeOrders} helper="Pedidos em andamento." />
        <SummaryCard label="Cupons" value={snapshot.activeCoupons} helper="Cupons ativos cadastrados." />
        <SummaryCard label="Destaques" value={snapshot.featuredProducts} helper="Produtos na vitrine principal." />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr,0.9fr]">
        <article className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">
            Pedidos recentes
          </p>
          <div className="mt-6 space-y-4">
            {orders.map((order) => (
              <div
                key={order.id}
                className="flex flex-col gap-3 rounded-[1.2rem] border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-white">{order.orderNumber}</p>
                  <p className="text-sm text-white/60">
                    {order.customerName} • {formatDate(order.createdAt)}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/[0.45]">
                    {order.status}
                  </p>
                  <p className="mt-1 font-semibold text-aaau-sand">
                    {formatCurrency(order.total)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">
            Catálogo resumido
          </p>
          <div className="mt-6 space-y-4">
            {products.map((product) => (
              <div
                key={product.id}
                className="flex flex-col gap-3 rounded-[1.2rem] border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-white">{product.name}</p>
                  <p className="text-sm text-white/60">{product.slug}</p>
                </div>
                <p className="font-semibold text-aaau-sand">{formatCurrency(product.price)}</p>
              </div>
            ))}
          </div>
        </article>
      </div>
    </AdminShell>
  );
}
