import { Reveal } from "@/components/shared/reveal";
import { SectionHeading } from "@/components/shared/section-heading";
import { sports } from "@/lib/data/seed-content";

export function SportsSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <Reveal>
        <SectionHeading
          eyebrow="Modalidades"
          title="Esporte como ponto de encontro."
          description="A estrutura inicial já considera as principais frentes competitivas da AAAU e abre espaço para expansão futura."
        />
      </Reveal>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {sports.map((sport, index) => (
          <Reveal key={sport} delay={index * 0.05}>
            <article className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">
                Modalidade
              </p>
              <p className="mt-4 font-display text-3xl uppercase tracking-[0.08em] text-white">
                {sport}
              </p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
