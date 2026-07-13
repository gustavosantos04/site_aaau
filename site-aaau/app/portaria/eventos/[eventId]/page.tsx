import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { PortariaEventClient } from "@/components/portaria/portaria-event-client";
import { requireAnyAdminRole } from "@/lib/auth";
import { getPortariaEventDashboard } from "@/lib/portaria";

export const metadata: Metadata = { title: "Portaria do evento" };

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(value);
}

export default async function PortariaEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const actor = await requireAnyAdminRole(["super_admin", "event_staff"]);
  const { eventId } = await params;
  const dashboard = await getPortariaEventDashboard(actor, eventId);
  if (!dashboard) notFound();

  return (
    <main className="min-h-screen bg-[#050505] px-4 py-5 text-white sm:px-6 lg:px-8">
      <section className="mx-auto max-w-5xl space-y-5">
        <header className="space-y-4">
          <Link href={"/portaria" as Route} className="text-sm font-bold uppercase text-white/55">Voltar para eventos</Link>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Portaria</p>
            <h1 className="mt-2 text-3xl font-black uppercase text-white sm:text-5xl">{dashboard.event.name}</h1>
            <p className="mt-2 text-sm text-white/60">{formatDate(dashboard.event.startAt)} - {dashboard.event.venueName}</p>
          </div>
          <div className="inline-flex rounded-full border border-emerald-300/35 bg-emerald-400/10 px-3 py-1 text-xs font-black uppercase text-emerald-100">
            {dashboard.event.status}
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-[#101010] p-4">
            <p className="text-xs font-bold uppercase text-white/45">Ingressos emitidos</p>
            <strong className="mt-2 block text-3xl text-white">{dashboard.metrics.issuedTickets}</strong>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#101010] p-4">
            <p className="text-xs font-bold uppercase text-white/45">Check-ins</p>
            <strong className="mt-2 block text-3xl text-white">{dashboard.metrics.checkIns}</strong>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#101010] p-4">
            <p className="text-xs font-bold uppercase text-white/45">Aguardando</p>
            <strong className="mt-2 block text-3xl text-white">{dashboard.metrics.pending}</strong>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#101010] p-4">
            <p className="text-xs font-bold uppercase text-white/45">Taxa</p>
            <strong className="mt-2 block text-3xl text-white">{dashboard.metrics.entryRate}%</strong>
          </div>
        </section>

        <PortariaEventClient eventId={dashboard.event.id} initialRecentEntries={dashboard.recentEntries} />
      </section>
    </main>
  );
}
