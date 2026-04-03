"use client";

import { useEffect, useState } from "react";

import { BrandLogo } from "@/components/shared/brand-logo";
import { cn } from "@/lib/utils";

export function Preloader() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 1850);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,rgba(167,29,58,0.22),transparent_24%),linear-gradient(180deg,#050506_0%,#080808_100%)] transition duration-700",
        visible ? "opacity-100" : "opacity-0",
      )}
      aria-hidden={!visible}
    >
      <div className="absolute inset-0 deck-grid opacity-[0.04]" />
      <div className="absolute left-1/2 top-1/2 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-aaau-ember/12 blur-[140px]" />

      <div className="relative flex flex-col items-center">
        <div className="preloader-pulse relative flex h-[13.5rem] w-[13.5rem] items-center justify-center sm:h-[16rem] sm:w-[16rem]">
          <div className="preloader-ring absolute inset-0 rounded-full border border-white/12" />
          <div className="preloader-ring absolute inset-[8%] rounded-full border border-aaau-ember/28" />
          <div className="absolute inset-[14%] overflow-hidden rounded-full border border-white/10 bg-white/[0.03]">
            <div className="preloader-liquid absolute inset-x-0 bottom-0 h-[76%] bg-[linear-gradient(180deg,rgba(186,33,65,0.98),rgba(111,16,35,1))]" />
            <div className="preloader-surface absolute inset-x-[10%] bottom-[70%] h-6 rounded-full bg-[radial-gradient(circle,rgba(247,242,234,0.28),rgba(247,242,234,0.06)_52%,transparent_72%)] blur-sm" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(255,255,255,0.12),transparent_34%)]" />
          </div>
          <div className="absolute inset-[24%] rounded-full bg-aaau-ember/14 blur-3xl" />
          <div className="absolute inset-[18%] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.08),transparent_66%)]" />
          <div className="relative h-28 w-28 sm:h-36 sm:w-36">
            <BrandLogo
              className="h-full w-full"
              priority
              sizes="(max-width: 640px) 112px, 144px"
              quality={100}
              imageClassName="scale-[1.04] object-contain [mix-blend-mode:screen] drop-shadow-[0_16px_34px_rgba(0,0,0,0.42)]"
            />
          </div>
        </div>

        <div className="mt-7 h-px w-28 overflow-hidden rounded-full bg-white/10">
          <div className="preloader-shimmer h-full w-1/2 rounded-full bg-gradient-to-r from-transparent via-aaau-sand to-transparent" />
        </div>

        <p className="mt-5 text-[0.68rem] font-semibold uppercase tracking-[0.42em] text-white/54 sm:text-xs">
          AAAU Uniritter
        </p>
      </div>
    </div>
  );
}
