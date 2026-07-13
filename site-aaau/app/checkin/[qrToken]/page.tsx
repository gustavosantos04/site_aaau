import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Validação de ingresso | AAAU",
  robots: { index: false, follow: false },
};

export default async function CheckInTokenPage({
  params,
}: {
  params: Promise<{ qrToken: string }>;
}) {
  const { qrToken } = await params;
  const ticket = await prisma.eventTicket.findUnique({
    where: { qrToken },
    select: {
      ticketCode: true,
      status: true,
      event: { select: { name: true } },
    },
  });

  if (!ticket) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-[68vh] max-w-3xl items-center px-4 py-12 sm:px-6">
      <section className="w-full rounded-[0.5rem] border border-white/10 bg-white/[0.05] p-6 text-center sm:p-8">
        <ShieldCheck className="mx-auto h-12 w-12 text-aaau-sand" />
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-aaau-sand">
          Ingresso oficial AAAU
        </p>
        <h1 className="mt-3 break-words font-display text-3xl uppercase tracking-[0.06em] text-white sm:text-5xl">
          Validação pela equipe
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/68">
          Este ingresso deve ser validado pela equipe autorizada do evento. Abrir esta página não registra a entrada nem altera o status do ingresso.
        </p>
        <div className="mx-auto mt-6 max-w-sm rounded-[0.5rem] border border-white/10 bg-aaau-night/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Código</p>
          <p className="mt-2 font-display text-3xl uppercase tracking-[0.08em] text-white">{ticket.ticketCode}</p>
          <p className="mt-2 text-sm text-white/60">{ticket.event.name}</p>
        </div>
      </section>
    </main>
  );
}
