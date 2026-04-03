import Image from "next/image";

import { Reveal } from "@/components/shared/reveal";
import { SectionHeading } from "@/components/shared/section-heading";
import { achievements } from "@/lib/data/seed-content";

export function AchievementsSection() {
  return (
    <section className="relative overflow-hidden border-y border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))]">
      <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(139,23,48,0.2),transparent_68%)]" />

      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <Reveal>
          <SectionHeading
            eyebrow="Conquistas"
            title="Títulos que pesam na memória."
            description="A seção vira uma vitrine de títulos: menos grade institucional e mais presença de campeão, com foto real, contraste forte e leitura emocional."
            className="max-w-3xl"
          />
        </Reveal>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {achievements.map((item, index) => (
            <Reveal key={item.title} delay={index * 0.08}>
              <article className="group relative min-h-[30rem] overflow-hidden rounded-[2rem] border border-white/10 bg-black/30 shadow-[0_28px_80px_rgba(0,0,0,0.34)]">
                <div className="absolute inset-0">
                  <Image
                    src={item.image}
                    alt={item.imageAlt}
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover transition duration-700 ease-out group-hover:scale-[1.06]"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,6,6,0.16)_0%,rgba(6,6,6,0.1)_26%,rgba(6,6,6,0.74)_72%,rgba(6,6,6,0.94)_100%)]" />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(139,23,48,0.34),transparent_38%)] opacity-80 transition duration-500 group-hover:opacity-100" />
                </div>

                <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),transparent_22%,transparent_78%,rgba(139,23,48,0.18))] opacity-60" />

                <div className="relative z-10 flex h-full flex-col justify-between p-5 sm:p-6 lg:p-7">
                  <div className="flex justify-end">
                    <div className="inline-flex rounded-full border border-white/14 bg-black/35 px-4 py-2 text-sm font-semibold uppercase tracking-[0.22em] text-white/82 shadow-[0_18px_45px_rgba(0,0,0,0.28)] backdrop-blur-xl transition duration-500 group-hover:border-aaau-ember/28 group-hover:bg-black/42">
                      {item.year}
                    </div>
                  </div>

                  <div className="max-w-[24rem]">
                    <h3 className="font-display text-3xl uppercase leading-[0.94] tracking-[0.08em] text-white sm:text-[2.35rem]">
                      {item.title}
                    </h3>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
