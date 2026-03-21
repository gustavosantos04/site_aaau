import Link from "next/link";

import { Reveal } from "@/components/shared/reveal";
import { buttonVariants } from "@/components/shared/button";

export function FinalCtaSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <Reveal>
        <div className="overflow-hidden rounded-[2.2rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(167,29,58,0.42),transparent_40%),linear-gradient(120deg,#181818,#090909)] p-8 sm:p-10 lg:p-12">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/50">
            CTA final
          </p>
          <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-4">
              <h2 className="font-display text-5xl uppercase tracking-[0.08em] text-white">
                Vista a AAAU e leve a marca para fora da quadra.
              </h2>
              <p className="text-base leading-8 text-white/70">
                A primeira entrega prioriza fundação sólida, catálogo funcional e uma
                linguagem visual preparada para escalar em campanhas, eventos e drops.
              </p>
            </div>
            <Link
              href="/produtos"
              className={buttonVariants({ variant: "light", size: "lg" })}
            >
              Ir para o catálogo
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
