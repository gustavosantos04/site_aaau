"use client";

import { useMemo, useState, type CSSProperties } from "react";

import { ManagementCard } from "@/components/home/management/management-card";
import { ManagementCardPanel } from "@/components/home/management/management-card-panel";
import { useManagementSectionMotion } from "@/components/home/management/use-management-section-motion";
import { SectionHeading } from "@/components/shared/section-heading";
import type { ManagementArea } from "@/lib/data/management";

export function ManagementSectionClient({ areas }: { areas: ManagementArea[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeArea = areas.find((area) => area.id === activeId) ?? null;
  const totalMembers = useMemo(
    () => areas.reduce((sum, area) => sum + area.members.length, 0),
    [areas],
  );

  const {
    sectionRef,
    headingRef,
    desktopStageRef,
    mobileRailRef,
    mobileDetailRef,
    registerCard,
    registerFlip,
  } = useManagementSectionMotion({
    areas,
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
        <div ref={headingRef} className="mx-auto mb-16 max-w-3xl text-center">
          <SectionHeading
            eyebrow="Gestão AAAU"
            title="Um baralho institucional com peso de marca."
            description="Cada frente da gestão aparece como uma carta premium: impactante na vitrine, precisa na leitura e memorável quando aberta."
          />

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/62">
              {areas.length} áreas
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/62">
              {totalMembers} integrantes
            </div>
            <div className="rounded-full border border-aaau-wine/30 bg-aaau-wine/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/76">
              Experiência Premium
            </div>
          </div>
        </div>

        <div ref={desktopStageRef} className="relative hidden lg:block">
          <div className="absolute inset-x-8 top-10 h-[34rem] rounded-full bg-aaau-wine/12 blur-[110px]" />
          <div className="absolute inset-x-0 top-[6rem] h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />

          <div className="relative h-[46rem] [perspective:2400px] [transform-style:preserve-3d]">
            {areas.map((area) => (
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
          </div>
        </div>

        <div ref={mobileRailRef} className="mt-12 lg:hidden">
          <div className="-mx-4 overflow-x-auto px-4 pb-3">
            <div className="flex min-w-max gap-4 pr-4">
              {areas.map((area, index) => (
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
                  } as CSSProperties
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
