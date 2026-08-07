import type { Metadata } from "next";

import { PortalAccessForm } from "@/components/events/portal-access-form";
import { eventTicketPortalEnabled } from "@/lib/events/portal-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Meus ingressos | AAAU",
  description: "Receba um link seguro para consultar seus ingressos.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function MyTicketsEntryPage({ searchParams }: {
  searchParams: Promise<{ acesso?: string }>;
}) {
  const query = await searchParams;
  const enabled = eventTicketPortalEnabled();
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <section className="rounded-[0.6rem] border border-white/10 bg-white/[0.04] p-6 shadow-glow sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-aaau-sand">Acesso seguro</p>
        <h1 className="mt-3 font-display text-5xl uppercase tracking-[0.06em] text-white sm:text-6xl">Meus ingressos</h1>
        <p className="mt-4 text-sm leading-7 text-white/68">
          Informe seu e-mail para receber um link temporário. Não é necessário criar conta ou senha.
        </p>
        {enabled ? (
          <PortalAccessForm initialMessage={query.acesso ? "Este acesso não está disponível. Solicite um novo link." : ""} />
        ) : (
          <p className="mt-8 rounded-[0.45rem] border border-white/10 bg-white/5 p-4 text-sm text-white/65">
            A central está temporariamente indisponível.
          </p>
        )}
      </section>
    </main>
  );
}
