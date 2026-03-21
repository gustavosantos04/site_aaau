import Link from "next/link";
import type { Metadata } from "next";

import { buttonVariants } from "@/components/shared/button";

export const metadata: Metadata = {
  title: "Pedido Confirmado",
};

export default function OrderConfirmedPage() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
        Pedido confirmado
      </p>
      <h1 className="mt-4 font-display text-6xl uppercase tracking-[0.08em] text-white">
        Recebemos seu pedido.
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-white/[0.68]">
        A gestão da AAAU entrará em contato pelo WhatsApp em até 2 dias para
        confirmar entrega ou retirada.
      </p>
      <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
        <Link href="/produtos" className={buttonVariants({ variant: "primary", size: "lg" })}>
          Voltar ao catálogo
        </Link>
        <Link href="/" className={buttonVariants({ variant: "secondary", size: "lg" })}>
          Ir para home
        </Link>
      </div>
    </section>
  );
}
