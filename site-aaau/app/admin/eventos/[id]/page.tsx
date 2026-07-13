import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  assignEventStaffAction,
  createEventStaffAction,
  eventStatusAction,
  resendTicketEmailAction,
  setEventStaffAssignmentAction,
} from "@/app/admin/eventos/actions";
import { AdminShell } from "@/components/admin/admin-shell";
import { EventAdminForm, EventLotForm, EventPartnerCodeForm } from "@/components/admin/event-admin-forms";
import { SummaryCard } from "@/components/admin/summary-card";
import { buttonVariants } from "@/components/shared/button";
import { requireAdminRole } from "@/lib/auth";
import { formatAdminMoney, getAdminEventCockpit } from "@/lib/events/admin";
import { getEventStaffAdmin } from "@/lib/portaria";

export const metadata: Metadata = { title: "Admin Evento" };

const tabs = [
  ["geral", "Visao geral"],
  ["lotes", "Lotes"],
  ["ingressos", "Ingressos"],
  ["pedidos", "Pedidos"],
  ["codigos", "Codigos / parceiros"],
  ["equipe", "Equipe / portaria"],
  ["config", "Configuracoes"],
] as const;

function formatDate(value?: Date | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(value);
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
      {children}
    </span>
  );
}

export default async function AdminEventCockpitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdminRole("super_admin");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const cockpit = await getAdminEventCockpit(id);
  if (!cockpit) notFound();
  const activeTab = tabs.some(([key]) => key === query.tab) ? query.tab! : "geral";
  const { event } = cockpit;
  const staffAdmin = activeTab === "equipe" ? await getEventStaffAdmin(event.id) : null;

  return (
    <AdminShell
      activeHref="/admin/eventos"
      title={event.name}
      description={`${formatDate(event.startAt)} - ${event.venueName}`}
    >
      <section className="rounded-[1.5rem] border border-white/10 bg-[#101010] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <Badge>{event.published ? "Publicado" : "Rascunho"}</Badge>
            <Badge>{event.status}</Badge>
          </div>
          <div className="flex flex-wrap gap-3">
            {event.published ? (
              <Link href={`/eventos/${event.slug}` as Route} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Ver pagina publica
              </Link>
            ) : null}
            <form action={eventStatusAction}>
              <input type="hidden" name="eventId" value={event.id} />
              <input type="hidden" name="operation" value={event.published ? "unpublish" : "publish"} />
              <button className={buttonVariants({ size: "sm" })}>
                {event.published ? "Despublicar" : "Publicar"}
              </button>
            </form>
            <form action={eventStatusAction}>
              <input type="hidden" name="eventId" value={event.id} />
              <input type="hidden" name="operation" value="cancel" />
              <button className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Cancelar evento
              </button>
            </form>
          </div>
        </div>

        <nav className="-mx-2 mt-6 flex gap-2 overflow-x-auto px-2 pb-1">
          {tabs.map(([key, label]) => (
            <Link
              key={key}
              href={`/admin/eventos/${event.id}?tab=${key}` as Route}
              className={
                activeTab === key
                  ? "shrink-0 rounded-full border border-aaau-ember bg-aaau-ember px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white"
                  : "shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/65"
              }
            >
              {label}
            </Link>
          ))}
        </nav>
      </section>

      {activeTab === "geral" ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Vendidos" value={cockpit.kpis.ticketsSold} helper="Tickets emitidos." />
            <SummaryCard label="Receita" value={formatAdminMoney(cockpit.kpis.confirmedRevenue)} helper="Somente PAID." />
            <SummaryCard label="Pendentes" value={cockpit.kpis.pendingOrders} helper="Reservas abertas." />
            <SummaryCard label="Check-ins" value={cockpit.kpis.checkIns} helper="Ingressos usados." />
            <SummaryCard label="Taxa" value={`${cockpit.kpis.checkInRate}%`} helper="USED / emitidos." />
          </div>
          <section className="rounded-[1.5rem] border border-white/10 bg-[#101010] p-5 sm:p-6">
            <h2 className="text-xl font-semibold text-white">Checklist de publicacao</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Badge>Informacoes do evento</Badge>
              <Badge>Data e local</Badge>
              <Badge>Periodo de vendas</Badge>
              <Badge>{cockpit.lots.length} lote(s) configurado(s)</Badge>
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "lotes" ? (
        <section className="space-y-5 rounded-[1.5rem] border border-white/10 bg-[#101010] p-5 sm:p-6">
          <EventLotForm eventId={event.id} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm [&_td]:pr-6 [&_th]:pr-6">
              <thead className="text-xs uppercase tracking-[0.16em] text-white/45">
                <tr><th>Lote</th><th>Posicao</th><th>Preco</th><th>Qtd</th><th>Vendidos</th><th>Reservados</th><th>Disponiveis</th><th>Inicio</th><th>Fim</th><th>Status</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-white/70">
                {cockpit.lots.map((lot) => (
                  <tr key={lot.id}>
                    <td className="py-3 pr-4 font-semibold text-white">{lot.name}</td>
                    <td>{lot.position}</td><td>{formatAdminMoney(lot.price)}</td><td>{lot.quantity}</td><td>{lot.soldQuantity}</td><td>{lot.reservedQuantity}</td><td>{lot.available}</td><td>{formatDate(lot.salesStartAt)}</td><td>{formatDate(lot.salesEndAt)}</td><td>{lot.computedStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cockpit.lots.length ? (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">Editar lotes</h2>
              {cockpit.lots.map((lot) => (
                <details key={lot.id} className="rounded-[1.25rem] border border-white/10 bg-white/[0.025] p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-white">
                    {lot.name} - {formatAdminMoney(lot.price)}
                  </summary>
                  <div className="mt-4">
                    <EventLotForm
                      eventId={event.id}
                      lot={{
                        id: lot.id,
                        name: lot.name,
                        description: lot.description,
                        price: lot.price.toString(),
                        quantity: lot.quantity,
                        salesStartAt: lot.salesStartAt,
                        salesEndAt: lot.salesEndAt,
                        position: lot.position,
                        active: lot.active,
                        autoActivate: lot.autoActivate,
                      }}
                    />
                  </div>
                </details>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === "ingressos" ? (
        <section className="rounded-[1.5rem] border border-white/10 bg-[#101010] p-5 sm:p-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm [&_td]:pr-6 [&_th]:pr-6">
              <thead className="text-xs uppercase tracking-[0.16em] text-white/45">
                <tr><th>Ticket</th><th>Participante</th><th>CPF</th><th>Lote</th><th>Pedido</th><th>Status</th><th>Check-in</th><th>Parceiro</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-white/70">
                {cockpit.tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td className="py-3 pr-4 font-semibold text-white">{ticket.ticketCode}</td>
                    <td>{ticket.participantName}</td><td>{ticket.participantCpfMasked}</td><td>{ticket.lotName}</td><td>{ticket.orderCode}</td><td>{ticket.status}</td><td>{formatDate(ticket.checkedInAt)}</td><td>{ticket.partnerCode ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === "pedidos" ? (
        <section className="rounded-[1.5rem] border border-white/10 bg-[#101010] p-5 sm:p-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm [&_td]:pr-3 [&_th]:pr-3">
              <thead className="text-xs uppercase tracking-[0.16em] text-white/45">
                <tr><th>Pedido</th><th>Comprador</th><th>Ingressos</th><th>Subtotal</th><th>Desconto</th><th>Total</th><th>Codigo</th><th>Status</th><th>Email</th><th>Data</th><th>Acao</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-white/70">
                {cockpit.orders.map((order) => (
                  <tr key={order.id}>
                    <td className="py-3 pr-4 font-semibold text-white">{order.code}</td>
                    <td>{order.buyerName}<br /><span className="text-xs text-white/45">{order.buyerEmail} - {order.buyerCpfMasked}</span></td>
                    <td>{order.participantCount}</td><td>{formatAdminMoney(order.subtotal)}</td><td>{formatAdminMoney(order.discountAmount)}</td><td className="font-semibold text-aaau-sand">{formatAdminMoney(order.total)}</td><td>{order.partnerCode ?? "-"}</td><td>{order.status}</td><td>{order.emailStatus}</td><td>{formatDate(order.createdAt)}</td>
                    <td>
                      {(order.emailStatus === "NOT_SENT" || order.emailStatus === "AMBIGUOUS") && order.status === "PAID" ? (
                        <form action={resendTicketEmailAction}>
                          <input type="hidden" name="eventId" value={event.id} />
                          <input type="hidden" name="eventOrderId" value={order.id} />
                          {order.emailStatus === "AMBIGUOUS" ? <input type="hidden" name="confirmAmbiguous" value="on" /> : null}
                          <button className="text-xs font-semibold uppercase tracking-[0.14em] text-aaau-sand">Reenviar</button>
                        </form>
                      ) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === "codigos" ? (
        <section className="space-y-5 rounded-[1.5rem] border border-white/10 bg-[#101010] p-5 sm:p-6">
          <EventPartnerCodeForm eventId={event.id} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm [&_td]:pr-6 [&_th]:pr-6">
              <thead className="text-xs uppercase tracking-[0.16em] text-white/45">
                <tr><th>Codigo</th><th>Parceiro</th><th>Tipo</th><th>Desconto</th><th>Reserv.</th><th>Confirm.</th><th>Limite</th><th>Pedidos pagos</th><th>Receita</th><th>Desconto concedido</th><th>Status</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-white/70">
                {cockpit.partnerCodes.map((code) => (
                  <tr key={code.id}>
                    <td className="py-3 pr-4 font-semibold text-white">{code.code}</td>
                    <td>{code.partnerName}</td><td>{code.partnerType}</td><td>{code.discountType === "PERCENTAGE" ? `${code.discountValue.toString()}%` : formatAdminMoney(code.discountValue)}</td><td>{code.reservedUses}</td><td>{code.confirmedUses}</td><td>{code.maxUses ?? "-"}</td><td>{code.paidOrders}</td><td>{formatAdminMoney(code.confirmedRevenue)}</td><td>{formatAdminMoney(code.confirmedDiscount)}</td><td>{code.active ? "Ativo" : "Inativo"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cockpit.partnerCodes.length ? (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/45">Editar codigos</h2>
              {cockpit.partnerCodes.map((code) => (
                <details key={code.id} className="rounded-[1.25rem] border border-white/10 bg-white/[0.025] p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-white">
                    {code.code} - {code.partnerName}
                  </summary>
                  <div className="mt-4">
                    <EventPartnerCodeForm
                      eventId={event.id}
                      code={{
                        id: code.id,
                        code: code.code,
                        partnerName: code.partnerName,
                        partnerType: code.partnerType,
                        discountType: code.discountType,
                        discountValue: code.discountValue.toString(),
                        maxUses: code.maxUses,
                        startsAt: code.startsAt,
                        expiresAt: code.expiresAt,
                        active: code.active,
                      }}
                    />
                  </div>
                </details>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === "equipe" && staffAdmin ? (
        <section className="space-y-6 rounded-[1.5rem] border border-white/10 bg-[#101010] p-5 sm:p-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <form action={assignEventStaffAction} className="space-y-4 rounded-[1.25rem] border border-white/10 bg-white/[0.025] p-4">
              <input type="hidden" name="eventId" value={event.id} />
              <div>
                <h2 className="text-lg font-semibold text-white">Atribuir staff existente</h2>
                <p className="mt-1 text-sm text-white/55">Somente usuarios event_staff aparecem aqui.</p>
              </div>
              <select name="adminUserId" required className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white">
                <option value="">Selecione</option>
                {staffAdmin.staffUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} - {user.email} - {user.isActive ? "ativo" : "inativo"}
                  </option>
                ))}
              </select>
              <button className={buttonVariants({ size: "sm" })}>Adicionar ao evento</button>
            </form>

            <form action={createEventStaffAction} className="space-y-4 rounded-[1.25rem] border border-white/10 bg-white/[0.025] p-4">
              <input type="hidden" name="eventId" value={event.id} />
              <div>
                <h2 className="text-lg font-semibold text-white">Criar event_staff</h2>
                <p className="mt-1 text-sm text-white/55">Role fixo event_staff. A senha inicial e armazenada somente como hash.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input name="name" required minLength={2} placeholder="Nome" className="rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white placeholder:text-white/35" />
                <input name="email" required type="email" placeholder="E-mail" className="rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white placeholder:text-white/35" />
                <input name="password" required type="password" minLength={8} placeholder="Senha inicial" className="rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white placeholder:text-white/35" />
                <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white/75">
                  <input name="active" type="checkbox" defaultChecked className="h-4 w-4" />
                  Ativo
                </label>
              </div>
              <button className={buttonVariants({ size: "sm" })}>Criar staff</button>
            </form>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm [&_td]:pr-6 [&_th]:pr-6">
              <thead className="text-xs uppercase tracking-[0.16em] text-white/45">
                <tr><th>Nome</th><th>E-mail</th><th>Status usuario</th><th>Acesso ao evento</th><th>Acao</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-white/70">
                {staffAdmin.assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <td className="py-3 pr-4 font-semibold text-white">{assignment.adminUser.name}</td>
                    <td>{assignment.adminUser.email}</td>
                    <td>{assignment.adminUser.isActive ? "Ativo" : "Inativo"}</td>
                    <td>{assignment.active ? "Liberado" : "Bloqueado"}</td>
                    <td>
                      <form action={setEventStaffAssignmentAction}>
                        <input type="hidden" name="eventId" value={event.id} />
                        <input type="hidden" name="assignmentId" value={assignment.id} />
                        <input type="hidden" name="active" value={assignment.active ? "false" : "true"} />
                        <button className="text-xs font-semibold uppercase tracking-[0.14em] text-aaau-sand">
                          {assignment.active ? "Remover acesso" : "Reativar"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {staffAdmin.assignments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-white/55">Nenhum staff atribuido a este evento.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === "config" ? (
        <EventAdminForm event={event} />
      ) : null}
    </AdminShell>
  );
}
