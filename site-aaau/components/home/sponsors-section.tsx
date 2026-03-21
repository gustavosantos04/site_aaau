import { Reveal } from "@/components/shared/reveal";
import { SectionHeading } from "@/components/shared/section-heading";
import { sponsors } from "@/lib/data/seed-content";

export function SponsorsSection() {
  return (
    <section className="border-y border-white/10 bg-white/[0.02]">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <Reveal>
          <SectionHeading
            eyebrow="Patrocínios"
            title="Parceiros que ampliam alcance."
            description="Área preparada para logos, ativações e contrapartidas futuras dentro da experiência institucional."
          />
        </Reveal>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {sponsors.map((sponsor, index) => (
            <Reveal key={sponsor} delay={index * 0.05}>
              <article className="flex min-h-36 items-center rounded-[1.8rem] border border-white/10 bg-black/20 px-6 py-8">
                <p className="font-display text-4xl uppercase tracking-[0.08em] text-white">
                  {sponsor}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
