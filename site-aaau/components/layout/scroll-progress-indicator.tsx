"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const HIDDEN_PREFIXES = ["/admin", "/checkout", "/pedido"];

export function ScrollProgressIndicator() {
  const pathname = usePathname();
  const railRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!railRef.current || !fillRef.current || !markerRef.current) {
      return;
    }

    let frame = 0;

    const updateProgress = () => {
      frame = 0;

      if (!railRef.current || !fillRef.current || !markerRef.current) {
        return;
      }

      const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollableHeight <= 0 ? 0 : window.scrollY / scrollableHeight;
      const clampedProgress = Math.min(Math.max(progress, 0), 1);
      const railHeight = railRef.current.offsetHeight;
      const markerHeight = markerRef.current.offsetHeight;
      const markerTravel = Math.max(railHeight - markerHeight, 0);
      const markerOffset = markerTravel * clampedProgress;
      const fillScale = Math.max(clampedProgress, 0.04);

      markerRef.current.style.transform = `translate3d(0, ${markerOffset}px, 0)`;
      fillRef.current.style.transform = `scaleY(${fillScale})`;
      fillRef.current.style.opacity = clampedProgress > 0.02 ? "1" : "0.55";
    };

    const requestTick = () => {
      if (!frame) {
        frame = window.requestAnimationFrame(updateProgress);
      }
    };

    requestTick();
    window.addEventListener("scroll", requestTick, { passive: true });
    window.addEventListener("resize", requestTick);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("scroll", requestTick);
      window.removeEventListener("resize", requestTick);
    };
  }, [pathname]);

  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-y-0 right-5 z-40 hidden xl:flex xl:items-center">
      <div className="flex h-[min(68vh,34rem)] w-20 flex-col items-center justify-between">
        <div className="flex flex-col items-center gap-2">
          <span className="text-[0.55rem] font-semibold uppercase tracking-[0.42em] text-white/32">
            AAAU
          </span>
          <span className="h-6 w-px bg-gradient-to-b from-white/0 via-white/22 to-white/0" />
        </div>

        <div className="relative flex h-full w-full items-center justify-center">
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 rounded-full bg-white/10" />

          <div
            ref={railRef}
            className="relative h-full w-px overflow-visible rounded-full bg-gradient-to-b from-white/10 via-white/18 to-white/8"
          >
            <div
              ref={fillRef}
              className="absolute inset-x-0 top-0 h-full origin-top rounded-full bg-gradient-to-b from-aaau-wine via-aaau-ember to-white/80 opacity-[0.55] shadow-[0_0_14px_rgba(139,23,48,0.35)]"
            />

            <div
              ref={markerRef}
              className="absolute left-1/2 top-0 -translate-x-1/2 will-change-transform"
            >
              <div className="scroll-indicator-float relative flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-[#0b0b0b]/88 shadow-[0_22px_55px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                <div className="absolute inset-1 rounded-full border border-aaau-ember/25" />
                <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(139,23,48,0.22),transparent_68%)]" />
                <div className="absolute inset-x-3 bottom-1 h-4 rounded-full bg-aaau-ember/16 blur-md" />
                <Image
                  src="/images/brand/bulldog-scroll.png"
                  alt="Indicador de rolagem bulldog da AAAU"
                  width={42}
                  height={42}
                  className="relative h-10 w-10 object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.42)]"
                  priority
                />
              </div>
            </div>
          </div>
        </div>

        <span className="text-[0.52rem] font-semibold uppercase tracking-[0.36em] text-white/26">
          Scroll
        </span>
      </div>
    </div>
  );
}
