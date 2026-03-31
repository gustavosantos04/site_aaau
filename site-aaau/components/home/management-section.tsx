"use client";

import { useMemo, useState } from "react";

import { ManagementCard } from "@/components/home/management/management-card";
import { ManagementCardPanel } from "@/components/home/management/management-card-panel";
import { useManagementSectionMotion } from "@/components/home/management/use-management-section-motion";
import { SectionHeading } from "@/components/shared/section-heading";
import { managementAreas } from "@/lib/data/management";

export function ManagementSection() {
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeArea = managementAreas.find((area) => area.id === activeId) ?? null;
  const totalMembers = useMemo(
    () => managementAreas.reduce((sum, area) => sum + area.members.length, 0),
    [],
  );

  const {
    sectionRef,
    headingRef,
    summaryRef,
    desktopStageRef,
    mobileRailRef,
    mobileDetailRef,
    registerCard,
    registerFlip,
  } = useManagementSectionMotion({
    areas: managementAreas,
    activeId,
  });

  return (
    <section
      id="gestao"
      ref={sectionRef}
      className="relative overflow-hidden border-y border-white/8 bg-[linear-gradient(180deg,rgba(7,7,8,0.96),rgba(9,9,11,1))] py-24 lg:py-32"
    >
      <div className="absolute inset-0">
        <div className="absolute left-[-12%] top-[-8rem] h-[26rem] w-[26rem] rounded-full bg-aaau-wine/18 blur-[150px]" />
        <div className="absolute right-[-8%] top-[20%] h-[24rem] w-[24rem] rounded-full bg-white/[0.03] blur-[140px]" />
        <div className="absolute bottom-[-10rem] left-1/2 h-[22rem] w-[42rem] -translate-x-1/2 rounded-full bg-aaau-ember/10 blur-[160px]" />
        <div className="deck-grid absolute inset-0 opacity-[0.06]" />
      </div>

      <div className="relative z-10 mx-auto max-w-[92rem] px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(24rem,0.9fr)] lg:items-end">
          <div ref={headingRef} className="max-w-3xl">
            <SectionHeading
              eyebrow="Gestao AAAU"
              title="Um baralho institucional com peso de marca."
              description="Cada frente da gestao aparece como uma carta premium: impactante na vitrine, precisa na leitura e memoravel quando aberta."
            />

            <div className="mt-8 flex flex-wrap gap-3">
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/62">
                {managementAreas.length} areas
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/62">
                {totalMembers} integrantes mockados
              </div>
              <div className="rounded-full border border-aaau-wine/30 bg-aaau-wine/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/76">
                Toque ou clique para revelar
              </div>
            </div>
          </div>

          <div
            ref={summaryRef}
            className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(111,16,35,0.28),transparent_36%)]" />
            <div className="deck-noise absolute inset-0 opacity-30" />

            <div className="relative space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-white/44">
                    Leitura atual
                  </p>
                  <h3 className="mt-2 font-display text-2xl uppercase tracking-[0.08em] text-white">
                    {activeArea ? activeArea.title : "Baralho em espera"}
                  </h3>
                </div>

                <div className="rounded-full border border-white/10 bg-black/25 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/58">
                  {activeArea ? "Carta aberta" : "Modo vitrine"}
                </div>
              </div>

              <p className="text-sm leading-7 text-white/68">
                {activeArea
                  ? activeArea.description
                  : "Passe pelas cartas para sentir profundidade e abra a area desejada para ver a composicao interna da gestao."}
              </p>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-4">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-white/42">Deck</p>
                  <p className="mt-2 font-display text-2xl uppercase text-white">06</p>
                </div>
                <div className="rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-4">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-white/42">Foco</p>
                  <p className="mt-2 font-display text-2xl uppercase text-white">
                    {activeArea?.symbol ?? "--"}
                  </p>
                </div>
                <div className="rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-4">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-white/42">Equipe</p>
                  <p className="mt-2 font-display text-2xl uppercase text-white">
                    {String(activeArea?.members.length ?? totalMembers).padStart(2, "0")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div ref={desktopStageRef} className="relative mt-14 hidden lg:block">
          <div className="absolute inset-x-8 top-10 h-[34rem] rounded-full bg-aaau-wine/12 blur-[110px]" />
          <div className="absolute inset-x-0 top-[6rem] h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />

          <div className="relative h-[46rem] [perspective:2400px] [transform-style:preserve-3d]">
            {managementAreas.map((area) => (
              <ManagementCard
                key={area.id}
                area={area}
                isActive={area.id === activeId}
                isDimmed={Boolean(activeId) && area.id !== activeId}
                onSelect={() =>
                  setActiveId((current) => (current === area.id ? null : area.id))
                }
                onClose={() => setActiveId(null)}
                registerCard={registerCard(area.id)}
                registerFlip={registerFlip(area.id)}
              />
            ))}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between">
              <div className="rounded-full border border-white/10 bg-black/30 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/52">
                Hover cria profundidade. Clique revela a carta.
              </div>

              <div className="rounded-full border border-white/10 bg-black/30 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/52">
                AAAU premium institutional deck
              </div>
            </div>
          </div>
        </div>

        <div ref={mobileRailRef} className="mt-12 lg:hidden">
          <div className="-mx-4 overflow-x-auto px-4 pb-3">
            <div className="flex min-w-max gap-4 pr-4">
              {managementAreas.map((area, index) => (
                <div
                  key={area.id}
                  className="relative flex w-[17rem] shrink-0 justify-center"
                  style={{
                    transform: `rotate(${index % 2 === 0 ? -3.5 : 3.5}deg)`,
                  }}
                >
                  <ManagementCard
                    area={area}
                    mode="mobile"
                    isActive={false}
                    onSelect={() => setActiveId(area.id)}
                    onClose={() => setActiveId(null)}
                    className="!relative !left-auto !top-auto !translate-x-0 !translate-y-0"
                  />
                </div>
              ))}
            </div>
          </div>

          {activeArea ? (
            <div ref={mobileDetailRef} className="mt-6 [perspective:2200px]">
              <div
                className="overflow-hidden rounded-[2rem] border border-white/10 shadow-[0_30px_90px_rgba(0,0,0,0.35)]"
                style={
                  {
                    "--card-glow": activeArea.palette.glow,
                  } as React.CSSProperties
                }
              >
                <ManagementCardPanel area={activeArea} onClose={() => setActiveId(null)} compact />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
