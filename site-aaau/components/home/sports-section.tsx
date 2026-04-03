"use client";

import Image from "next/image";

import { SectionHeading } from "@/components/shared/section-heading";
import { useSportsSectionMotion } from "@/components/home/sports/use-sports-section-motion";

const sportsData = [
  { name: "Futsal", image: "/images/mascots/bull_futsal.png" },
  { name: "Vôlei", image: "/images/mascots/bull_volei.png" },
  { name: "Handebol", image: "/images/mascots/bull_hand.png" },
  { name: "Basquete", image: "/images/mascots/bull_basquete.png" },
  { name: "Fut7", image: "/images/mascots/bull_fut7.png" },
];

export function SportsSection() {
  const { sectionRef, headingRef, cardsRef, veilRef, clawMarksRef } = useSportsSectionMotion();

  return (
    <section ref={sectionRef} className="relative overflow-hidden bg-aaau-night py-24 lg:py-32">
      <div
        ref={veilRef}
        className="pointer-events-none absolute inset-0 z-50 bg-aaau-wine/20 backdrop-blur-sm"
      />

      <div
        ref={clawMarksRef}
        className="pointer-events-none absolute inset-0 z-40 flex flex-col justify-center gap-8 opacity-20"
      >
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="claw-mark h-1 w-full skew-y-[-15deg] bg-gradient-to-r from-transparent via-aaau-sand to-transparent"
          />
        ))}
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div ref={headingRef}>
          <SectionHeading
            eyebrow="Modalidades"
            title="Esporte como ponto de encontro."
            description="A estrutura inicial já considera as principais frentes competitivas da AAAU e abre espaço para expansão futura."
          />
        </div>

        <div ref={cardsRef} className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {sportsData.map((sport) => (
            <article
              key={sport.name}
              className="sport-card group relative flex flex-col items-center overflow-hidden rounded-[2.5rem] border border-white/5 bg-white/[0.02] p-8 transition-all duration-500 hover:border-aaau-wine/30 hover:bg-white/[0.04]"
            >
              <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-aaau-wine/5 blur-[40px] transition-opacity group-hover:opacity-100" />

              <div className="sport-bull relative mb-8 h-48 w-48 transition-transform duration-500 group-hover:scale-110">
                <Image
                  src={sport.image}
                  alt={`Mascote do ${sport.name}`}
                  fill
                  className="object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]"
                  sizes="(max-width: 768px) 100vw, 200px"
                />
              </div>

              <div className="relative z-10 text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-aaau-sand/40">
                  Modalidade
                </p>
                <h3 className="mt-2 font-display text-2xl font-black uppercase tracking-wider text-white">
                  {sport.name}
                </h3>
              </div>

              <div className="mt-6 h-1 w-0 bg-aaau-wine transition-all duration-500 group-hover:w-12" />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
