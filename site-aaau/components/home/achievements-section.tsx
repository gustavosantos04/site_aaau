import { Reveal } from "@/components/shared/reveal";
import { SectionHeading } from "@/components/shared/section-heading";
import { achievements } from "@/lib/data/seed-content";

export function AchievementsSection() {
  return (
    <section className="border-y border-white/10 bg-white/[0.02]">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <Reveal>
          <SectionHeading
            eyebrow="Conquistas"
            title="Resultados que sustentam a narrativa."
            description="As vitórias reforçam pertencimento, reputação e o valor simbólico dos produtos dentro da comunidade."
          />
        </Reveal>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {achievements.map((item, index) => (
            <Reveal key={item} delay={index * 0.05}>
              <article className="rounded-[1.8rem] border border-white/10 bg-black/20 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
                  Título
                </p>
                <p className="mt-4 font-display text-3xl uppercase tracking-[0.08em] text-white">
                  {item}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
