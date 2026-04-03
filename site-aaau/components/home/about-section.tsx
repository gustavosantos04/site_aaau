import Image from "next/image";

import { Reveal } from "@/components/shared/reveal";
import { BrandLogo } from "@/components/shared/brand-logo";
import { SectionHeading } from "@/components/shared/section-heading";

export function AboutSection() {
  return (
    <section id="sobre" className="relative isolate overflow-hidden border-b border-white/10">
      <div className="pointer-events-none absolute inset-0">
        <div className="hero-glow-drift absolute left-[6%] top-20 h-48 w-48 rounded-full bg-aaau-ember/18 blur-3xl" />
        <div className="absolute right-[-2%] top-10 h-64 w-64 rounded-full bg-white/[0.04] blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
      </div>

      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid gap-10 xl:grid-cols-[1.06fr,0.94fr] xl:items-center">
          <Reveal>
            <div className="relative">
              <div className="pointer-events-none absolute left-0 top-[-1.25rem] hidden font-display text-[9rem] uppercase leading-none tracking-[0.16em] text-white/[0.04] lg:block">
                AAAU
              </div>

              <SectionHeading
                eyebrow="Sobre a AAAU"
                title="Não é só atlética. É presença de campus em modo jogo."
                description="A AAAU existe para transformar raça, torcida, tradição e convivência universitária em algo que se vê, se veste e se sente dentro e fora da quadra."
                className="relative z-10 max-w-3xl"
              />

              <p className="relative z-10 mt-8 max-w-2xl text-sm leading-8 text-white/[0.72] sm:text-base md:text-lg">
                Da recepção dos calouros ao dia de competição, a marca precisa
                carregar o peso do grito, da comunidade e da memória que fica
                depois do apito. O objetivo aqui é dar a essa energia uma forma
                premium, limpa e inesquecível.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.12}>
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(111,16,35,0.24),rgba(255,255,255,0.04)_58%,rgba(0,0,0,0.14))] p-6 shadow-glow sm:p-8">
              <div className="absolute left-6 top-6 flex gap-2 opacity-60">
                {[0, 1, 2].map((item) => (
                  <span
                    key={item}
                    className="h-10 w-[3px] rounded-full bg-gradient-to-b from-aaau-sand/75 via-aaau-ember/70 to-transparent"
                  />
                ))}
              </div>

              <div className="absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />

              <div className="absolute bottom-[-2.75rem] right-[-0.5rem] hidden w-[15rem] md:block">
                <Image
                  src="/images/mascots/bull_torcida.png"
                  alt="Mascote da AAAU celebrando a energia da torcida"
                  width={720}
                  height={720}
                  className="h-auto w-full object-contain opacity-15 saturate-0"
                />
              </div>

              <div className="relative z-10 flex items-center gap-4">
                <BrandLogo className="h-16 w-16 sm:h-18 sm:w-18" />

                <div>
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.28em] text-white/50">
                    Selo de presença
                  </p>
                  <p className="mt-2 font-display text-2xl uppercase tracking-[0.08em] text-white sm:text-[2rem]">
                    1,2,3... AAAU!
                  </p>
                </div>
              </div>

              <p className="relative z-10 mt-10 max-w-[24rem] text-base leading-8 text-white/[0.8] sm:text-lg">
                A marca da AAAU entra para ocupar a quadra, puxar a arquibancada e
                virar símbolo de pertencimento.
              </p>

              <div className="relative z-10 mt-10 flex flex-wrap gap-3 text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-white/48">
                <span>Raça</span>
                <span className="text-white/24">/</span>
                <span>Tradição</span>
                <span className="text-white/24">/</span>
                <span>Comunidade</span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
