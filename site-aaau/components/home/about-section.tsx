import { Reveal } from "@/components/shared/reveal";
import { SectionHeading } from "@/components/shared/section-heading";

export function AboutSection() {
  return (
    <section id="sobre" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <Reveal>
        <SectionHeading
          eyebrow="Sobre a AAAU"
          title="Identidade universitária com leitura de marca."
          description="A AAAU conecta esporte, pertencimento e presença visual. O site nasce para transformar essa força em narrativa institucional, comunidade e receita recorrente por meio dos produtos."
        />
      </Reveal>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        {[
          {
            title: "Marca",
            description:
              "Construção visual premium inspirada em linguagem esportiva contemporânea, sem perder o DNA universitário.",
          },
          {
            title: "Comunidade",
            description:
              "Experiência centrada em alunos, atletas, gestão e torcida com navegação direta, emocional e mobile-first.",
          },
          {
            title: "Receita",
            description:
              "Catálogo, carrinho e checkout estruturados para lançar coleções, operar pedidos e crescer com novas campanhas.",
          },
        ].map((item, index) => (
          <Reveal key={item.title} delay={index * 0.08}>
            <article className="rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">
                {item.title}
              </p>
              <p className="mt-4 text-sm leading-7 text-white/70">{item.description}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
