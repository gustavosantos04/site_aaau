import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PortalTicketCard } from "@/components/events/portal-ticket-card";
import { buttonVariants } from "@/components/shared/button";
import { getEventTicketPortalView } from "@/lib/events/portal-access";
import { getPortalSessionFromCookie } from "@/lib/events/portal-cookie";
import { logoutPortalAction } from "./actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Painel de ingressos | AAAU", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function TicketPortalPanelPage() {
  const session = await getPortalSessionFromCookie();
  if (!session) redirect("/meus-ingressos" as never);
  const view = await getEventTicketPortalView(session);
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="flex flex-col gap-5 rounded-[0.6rem] border border-white/10 bg-white/[0.04] p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aaau-sand">Sessão temporária</p>
          <h1 className="mt-2 font-display text-5xl uppercase tracking-[0.06em] text-white">Meus ingressos</h1>
          <p className="mt-3 text-sm text-white/60">A autorização de cada ingresso é recalculada a cada acesso.</p>
        </div>
        <form action={logoutPortalAction}><button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>Sair</button></form>
      </header>
      {view.groups.length ? <div className="mt-7 space-y-8">{view.groups.map((group) => (
        <section key={group.groupId} aria-labelledby={`group-${group.groupId.replace(/[^a-zA-Z0-9]/g, "-")}`}>
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.18em] text-white/45">{group.label}</p>
            <h2 id={`group-${group.groupId.replace(/[^a-zA-Z0-9]/g, "-")}`} className="mt-1 font-display text-4xl uppercase tracking-[0.05em] text-white">{group.event.name}</h2>
          </div>
          <div className="space-y-4">{group.tickets.map((ticket) => <PortalTicketCard key={ticket.ticketId} ticket={ticket} event={group.event} />)}</div>
        </section>
      ))}</div> : <section className="mt-7 rounded-[0.5rem] border border-white/10 bg-white/[0.04] p-6 text-center text-white/65">Nenhum ingresso está disponível nesta sessão.</section>}
    </main>
  );
}
