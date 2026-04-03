"use client";

import { useRef } from "react";

import { HeroAtmosphere } from "@/components/home/hero/hero-atmosphere";
import { HeroBackgroundMedia } from "@/components/home/hero/hero-background-media";
import { HeroContent } from "@/components/home/hero/hero-content";
import { HeroMascots } from "@/components/home/hero/hero-mascots";
import { useHeroMotion } from "@/components/home/hero/use-hero-motion";
import { featuredStats } from "@/lib/data/seed-content";

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
      className="relative isolate min-h-[calc(100svh-73px)] overflow-hidden border-b border-white/10 bg-[linear-gradient(180deg,#090909_0%,#080808_100%)] sm:min-h-[calc(100svh-81px)]"
    >
      <HeroBackgroundMedia backgroundRef={backgroundRef} />
      <HeroAtmosphere atmosphereRef={atmosphereRef} />
      <HeroMascots leftRef={leftRef} rightRef={rightRef} />

      <div className="relative z-10 flex min-h-[calc(100svh-73px)] items-center justify-center px-4 pb-10 pt-10 sm:min-h-[calc(100svh-81px)] sm:px-6 sm:pb-36 sm:pt-14 lg:px-8 lg:pb-32">
        <HeroContent contentRef={contentRef} />
      </div>

      <div className="relative z-10 border-t border-white/[0.08] bg-black/[0.36] backdrop-blur-md md:absolute md:inset-x-0 md:bottom-0">
        <div className="mx-auto grid max-w-7xl gap-px overflow-hidden sm:grid-cols-2 xl:grid-cols-4">
          {featuredStats.map((stat) => (
            <div
              key={stat.label}
              className="bg-white/[0.03] px-4 py-4 text-center sm:px-5 sm:text-left"
            >
              <p className="font-display text-3xl uppercase tracking-[0.08em] text-white sm:text-4xl">
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
