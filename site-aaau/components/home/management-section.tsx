import { Reveal } from "@/components/shared/reveal";
import { SectionHeading } from "@/components/shared/section-heading";
import { managementGroups } from "@/lib/data/seed-content";

export function ManagementSection() {
  return (
    <section id="gestao" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <Reveal>
        <SectionHeading
          eyebrow="Gestão"
          title="Frentes organizadas para escalar."
          description="O site já nasce refletindo uma estrutura de operação clara, útil para coordenação interna e confiança externa."
        />
      </Reveal>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {managementGroups.map((group, index) => (
          <Reveal key={group.name} delay={index * 0.05}>
            <article className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">
                Grupo
              </p>
              <h3 className="mt-4 font-display text-3xl uppercase tracking-[0.08em] text-white">
                {group.name}
              </h3>
              <p className="mt-3 text-sm leading-7 text-white/[0.65]">{group.description}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
