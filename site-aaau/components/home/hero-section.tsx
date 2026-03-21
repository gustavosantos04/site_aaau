"use client";

import { useRef } from "react";

import { HeroAtmosphere } from "@/components/home/hero/hero-atmosphere";
import { HeroBackgroundMedia } from "@/components/home/hero/hero-background-media";
import { HeroContent } from "@/components/home/hero/hero-content";
import { HeroMascots } from "@/components/home/hero/hero-mascots";
import { useHeroMotion } from "@/components/home/hero/use-hero-motion";
import { featuredStats } from "@/lib/data/seed-content";
import { heroMediaSlides } from "@/lib/data/hero-media";

export function HeroSection() {
  const rootRef = useRef<HTMLElement>(null);
  const backgroundRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const atmosphereRef = useRef<HTMLDivElement>(null);

  useHeroMotion({
    rootRef,
    backgroundRef,
    contentRef,
    leftRef,
    rightRef,
    atmosphereRef,
  });

  return (
    <section
      ref={rootRef}
      className="relative isolate min-h-[calc(100svh-81px)] overflow-hidden border-b border-white/10"
    >
      <HeroBackgroundMedia items={heroMediaSlides} backgroundRef={backgroundRef} />
      <HeroAtmosphere atmosphereRef={atmosphereRef} />
      <HeroMascots leftRef={leftRef} rightRef={rightRef} />

      <div className="relative z-10 flex min-h-[calc(100svh-81px)] items-center justify-center px-4 pb-32 pt-14 sm:px-6 lg:px-8">
        <HeroContent contentRef={contentRef} />
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 border-t border-white/[0.08] bg-black/[0.36] backdrop-blur-md">
        <div className="mx-auto grid max-w-7xl gap-px overflow-hidden sm:grid-cols-2 xl:grid-cols-4">
          {featuredStats.map((stat) => (
            <div
              key={stat.label}
              className="bg-white/[0.03] px-5 py-4 text-center sm:text-left"
            >
              <p className="font-display text-4xl uppercase tracking-[0.08em] text-white">
                {stat.value}
              </p>
              <p className="mt-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
