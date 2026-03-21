import { Reveal } from "@/components/shared/reveal";
import { SectionHeading } from "@/components/shared/section-heading";
import { formatDate } from "@/lib/utils";
import type { EventItem } from "@/types/store";

export function EventsSection({ events }: { events: EventItem[] }) {
  return (
    <section id="eventos" className="border-y border-white/10 bg-white/[0.02]">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <Reveal>
          <SectionHeading
            eyebrow="Eventos"
            title="Agenda viva para a comunidade."
            description="Eventos reforçam calendário, pertencimento e criam novos momentos de venda e ativação da marca."
          />
        </Reveal>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {events.map((event, index) => (
            <Reveal key={event.id} delay={index * 0.06}>
              <article className="overflow-hidden rounded-[1.8rem] border border-white/10 bg-black/20">
                <div className="h-44 bg-[radial-gradient(circle_at_top,rgba(167,29,58,0.4),transparent_40%),linear-gradient(120deg,#1a1a1a,#090909)]" />
                <div className="space-y-4 p-6">
                  <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.22em] text-white/[0.45]">
                    <span>{formatDate(event.startsAt)}</span>
                    <span>{event.location}</span>
                  </div>
                  <h3 className="font-display text-3xl uppercase tracking-[0.08em] text-white">
                    {event.title}
                  </h3>
                  <p className="text-sm leading-7 text-white/[0.65]">{event.excerpt}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
