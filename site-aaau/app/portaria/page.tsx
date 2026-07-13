import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";

import { logoutAdminAction } from "@/app/admin/actions";
import { buttonVariants } from "@/components/shared/button";
import { requireAnyAdminRole } from "@/lib/auth";
import { getPortariaEvents } from "@/lib/portaria";

export const metadata: Metadata = { title: "Portaria" };

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(value);
}

export default async function PortariaPage() {
  const actor = await requireAnyAdminRole(["super_admin", "event_staff"]);
  const events = await getPortariaEvents(actor);

  return (
    <main className="min-h-screen bg-[#050505] px-4 py-5 text-white sm:px-6 lg:px-8">
      <section className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Portaria</p>
            <h1 className="mt-2 text-3xl font-black uppercase text-white sm:text-5xl">Entrada de eventos</h1>
            <p className="mt-2 text-sm text-white/55">{actor.role === "super_admin" ? "Acesso global" : "Eventos atribuidos ao operador"}</p>
          </div>
          <form action={logoutAdminAction}>
            <button className="rounded-xl border border-white/15 px-4 py-3 text-xs font-black uppercase text-white/75">Sair</button>
          </form>
        </header>

        <div className="grid gap-4">
          {events.map((event) => (
            <article key={event.id} className="space-y-4 rounded-2xl border border-white/10 bg-[#101010] p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="inline-flex rounded-full border border-emerald-300/35 bg-emerald-400/10 px-3 py-1 text-xs font-black uppercase text-emerald-100">
                    {event.status}
                  </div>
                  <h2 className="mt-3 text-2xl font-black text-white">{event.name}</h2>
                  <p className="mt-1 text-sm text-white/60">{formatDate(event.startAt)} - {event.venueName}</p>
                </div>
                <Link href={`/portaria/eventos/${event.id}` as Route} className={buttonVariants({ size: "sm" })}>
                  Abrir portaria
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-white/45">Ingressos</p>
                  <strong className="text-2xl text-white">{event.issuedTickets}</strong>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-white/45">Check-ins</p>
                  <strong className="text-2xl text-white">{event.checkIns}</strong>
                </div>
              </div>
            </article>
          ))}
          {events.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#101010] p-6 text-white/60">
              Nenhum evento disponivel para esta portaria.
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
