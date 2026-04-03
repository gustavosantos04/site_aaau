"use client";

import { historyTimeline } from "@/lib/data/seed-content";
import { SectionHeading } from "@/components/shared/section-heading";
import { Reveal } from "@/components/shared/reveal";
import { useHistoryTimelineMotion } from "@/components/home/history/use-history-timeline-motion";

export function TimelineSection() {
  const {
    sectionRef,
    containerRef,
    cardsRef,
    lastCardRef,
    historyStageRef,
    transitionLayerRef,
  } = useHistoryTimelineMotion();

  return (
    <section 
      ref={sectionRef} 
      className="relative h-screen overflow-hidden bg-aaau-night"
    >
      {/* Cinematic Background Elements */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(111,16,35,0.15),_transparent_70%)]" />
        <div className="absolute inset-0 bg-hero-grid bg-[size:60px_60px] opacity-[0.03]" />
      </div>

      <div
        ref={transitionLayerRef}
        className="pointer-events-none absolute inset-0 z-30 opacity-0"
      >
        <div className="absolute inset-0 bg-[#f5f1ea]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(255,255,255,0.92),_rgba(245,241,234,0.98)_58%,_rgba(235,228,220,1)_100%)]" />
      </div>

      <div ref={historyStageRef} className="relative z-10 flex h-full flex-col justify-center">
        <div className="mb-16 px-4 sm:px-6 lg:px-24">
          <div className="max-w-3xl">
            <Reveal>
              <SectionHeading
                eyebrow="Nossa Jornada"
                title="A evolução de uma marca."
                description="Da fundação competitiva à nova fase digital premium. Uma história escrita com suor, raça e visão de futuro."
              />
            </Reveal>
          </div>
        </div>

        <div 
          ref={containerRef} 
          className="relative flex items-center"
        >
          <div 
            ref={cardsRef} 
            className="flex gap-12 px-[10vw] lg:px-[20vw]"
          >
            {historyTimeline.map((item, index) => {
              const isLast = index === historyTimeline.length - 1;
              return (
                <div
                  key={item.year}
                  ref={isLast ? lastCardRef : null}
                  className="timeline-card group relative w-[85vw] flex-shrink-0 md:w-[50vw] lg:w-[35vw]"
                >
                  <article className="relative flex h-[50vh] flex-col justify-between overflow-hidden rounded-[2.5rem] border border-white/5 bg-white/[0.02] p-10 backdrop-blur-md transition-all duration-500 hover:border-aaau-wine/30 hover:bg-white/[0.04]">
                    {/* Card Background Glow */}
                    <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-aaau-wine/5 blur-[80px] transition-opacity group-hover:opacity-100" />
                    
                    <div className="relative z-10">
                      <div className="mb-8 flex items-baseline gap-4">
                        <span className="font-display text-6xl font-black tracking-tighter text-aaau-sand/20 transition-colors duration-500 group-hover:text-aaau-sand">
                          {item.year}
                        </span>
                        <div className="h-[2px] flex-grow bg-gradient-to-r from-aaau-sand/20 to-transparent" />
                      </div>
                      
                      <h3 className="mb-6 text-3xl font-bold text-white lg:text-4xl">
                        {item.title}
                      </h3>
                      
                      <p className="text-lg leading-relaxed text-aaau-smoke/80 lg:text-xl">
                        {item.description}
                      </p>
                    </div>

                    <div className="relative z-10 mt-auto">
                      {isLast ? (
                        <div className="flex items-center gap-4 text-aaau-sand">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-aaau-sand/20 bg-aaau-sand/5">
                            <div className="h-2 w-2 animate-ping rounded-full bg-aaau-sand" />
                          </div>
                          <span className="text-sm font-bold uppercase tracking-[0.2em]">
                            Mergulhar no Futuro
                          </span>
                        </div>
                      ) : (
                        <div className="h-1 w-12 bg-aaau-wine/40 transition-all duration-500 group-hover:w-24 group-hover:bg-aaau-wine" />
                      )}
                    </div>
                  </article>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="absolute bottom-12 left-1/2 z-20 -translate-x-1/2">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-aaau-smoke/40">Siga a linha</span>
          <div className="h-[1px] w-12 bg-white/10" />
        </div>
      </div>
    </section>
  );
}
