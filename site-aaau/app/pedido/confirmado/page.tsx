import Link from "next/link";
import type { Metadata } from "next";

import { buttonVariants } from "@/components/shared/button";

export const metadata: Metadata = {
  title: "Pedido Confirmado",
};

export default async function OrderConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string }>;
}) {
  const params = await searchParams;

  return (
    <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
        Pedido criado
      </p>
      <h1 className="mt-4 font-display text-5xl uppercase tracking-[0.08em] text-white sm:text-6xl">
        Recebemos seu pedido.
      </h1>
      {params.pedido ? (
        <p className="mx-auto mt-5 w-fit rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
          {params.pedido}
        </p>
      ) : null}
      <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-white/[0.68]">
        O pedido nasceu como pendente. Se o Mercado Pago estiver configurado, o status sera
        atualizado automaticamente pelo webhook apos o pagamento.
      </p>
      <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
        <Link href="/produtos" className={buttonVariants({ variant: "primary", size: "lg" })}>
          Voltar ao catalogo
        </Link>
        <Link href="/" className={buttonVariants({ variant: "secondary", size: "lg" })}>
          Ir para home
        </Link>
      </div>
    </section>
  );
}
