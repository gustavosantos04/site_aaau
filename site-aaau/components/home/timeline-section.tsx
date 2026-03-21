import { Reveal } from "@/components/shared/reveal";
import { SectionHeading } from "@/components/shared/section-heading";
import { historyTimeline } from "@/lib/data/seed-content";

export function TimelineSection() {
  return (
    <section className="border-y border-white/10 bg-white/[0.02]">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <Reveal>
          <SectionHeading
            eyebrow="História"
            title="Linha do tempo da atlética."
            description="Uma narrativa inicial para apresentar origem, evolução competitiva e a nova fase da marca digital."
          />
        </Reveal>

        <div className="mt-10 space-y-5">
          {historyTimeline.map((item, index) => (
            <Reveal key={item.year} delay={index * 0.05}>
              <article className="grid gap-4 rounded-[1.8rem] border border-white/10 bg-black/20 p-5 md:grid-cols-[140px,1fr]">
                <p className="font-display text-4xl uppercase tracking-[0.08em] text-aaau-sand">
                  {item.year}
                </p>
                <div>
                  <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-white/[0.65]">{item.description}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
