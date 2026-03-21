import Link from "next/link";

import { buttonVariants } from "@/components/shared/button";

export default function NotFound() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
        404
      </p>
      <h1 className="mt-4 font-display text-6xl uppercase tracking-[0.08em] text-white">
        Página não encontrada.
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-white/[0.68]">
        O conteúdo que você tentou acessar ainda não existe ou foi movido.
      </p>
      <Link href="/" className={buttonVariants({ variant: "primary", size: "lg", className: "mt-10" })}>
        Voltar para home
      </Link>
    </section>
  );
}
