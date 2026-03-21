import { Reveal } from "@/components/shared/reveal";
import { SectionHeading } from "@/components/shared/section-heading";
import { campuses } from "@/lib/data/seed-content";

export function CampusesSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <Reveal>
        <SectionHeading
          eyebrow="Sedes"
          title="Presença distribuída e conectada."
          description="Os campi ativos aparecem como polos estratégicos para encontros, retirada de pedidos e ações presenciais."
        />
      </Reveal>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {campuses.map((campus, index) => (
          <Reveal key={campus} delay={index * 0.05}>
            <article className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">
                Campus ativo
              </p>
              <p className="mt-4 font-display text-4xl uppercase tracking-[0.08em] text-white">
                {campus}
              </p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
