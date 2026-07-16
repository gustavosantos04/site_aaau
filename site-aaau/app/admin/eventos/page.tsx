import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";

import { AdminShell } from "@/components/admin/admin-shell";
import { SummaryCard } from "@/components/admin/summary-card";
import { buttonVariants } from "@/components/shared/button";
import { requireAdminRole } from "@/lib/auth";
import { formatAdminMoney, getAdminEventsDashboard } from "@/lib/events/admin";
import { adminStatusLabel } from "@/lib/events/admin-labels";

export const metadata: Metadata = { title: "Admin Eventos" };

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(value);
}

export default async function AdminEventsPage() {
  await requireAdminRole("super_admin");
  const dashboard = await getAdminEventsDashboard();

  return (
    <AdminShell
      activeHref="/admin/eventos"
      title="Eventos"
      description="Operacao comercial de eventos, lotes, pedidos, ingressos e parceiros."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Eventos ativos" value={dashboard.kpis.activeEvents} helper="Publicados e operacionais." />
        <SummaryCard label="Ingressos vendidos" value={dashboard.kpis.ticketsSold} helper="Tickets emitidos historicos." />
        <SummaryCard label="Receita confirmada" value={formatAdminMoney(dashboard.kpis.confirmedRevenue)} helper="Somente pedidos pagos." />
        <SummaryCard label="Check-ins" value={dashboard.kpis.checkIns} helper={`${dashboard.kpis.pendingOrders} pedidos pendentes.`} />
      </div>

      <section className="rounded-[1.5rem] border border-white/10 bg-[#101010] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.2)] sm:p-6">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">Lista</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Eventos comerciais</h2>
          </div>
          <Link href={"/admin/eventos/novo" as Route} className={buttonVariants({ size: "md" })}>
            Novo evento
          </Link>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.18em] text-white/45">
              <tr>
                <th className="py-3 pr-4">Evento</th>
                <th className="py-3 pr-4">Data</th>
                <th className="py-3 pr-4">Publico</th>
                <th className="py-3 pr-4">Admin</th>
                <th className="py-3 pr-4">Lote atual</th>
                <th className="py-3 pr-4">Vendidos</th>
                <th className="py-3 pr-4">Receita</th>
                <th className="py-3 pr-4">Check-ins</th>
                <th className="py-3">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-white/72">
              {dashboard.events.map((event) => (
                <tr key={event.id}>
                  <td className="py-4 pr-4">
                    <p className="font-semibold text-white">{event.name}</p>
                    <p className="text-xs text-white/45">{event.slug}</p>
                  </td>
                  <td className="py-4 pr-4">{formatDate(event.startAt)}</td>
                  <td className="py-4 pr-4">{event.publicStatus}</td>
                  <td className="py-4 pr-4">{event.published ? "Publicado" : "Rascunho"} · {adminStatusLabel(event.adminStatus)}</td>
                  <td className="py-4 pr-4">{event.currentLotName}</td>
                  <td className="py-4 pr-4">{event.sold}</td>
                  <td className="py-4 pr-4 font-semibold text-aaau-sand">{formatAdminMoney(event.revenue)}</td>
                  <td className="py-4 pr-4">{event.checkIns}</td>
                  <td className="py-4">
                    <Link href={`/admin/eventos/${event.id}` as Route} className="font-semibold uppercase tracking-[0.14em] text-aaau-sand">
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
              {dashboard.events.length === 0 ? (
                <tr><td colSpan={9} className="py-8 text-center text-white/50">Nenhum evento comercial cadastrado.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
