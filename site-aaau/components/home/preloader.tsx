"use client";

import { useEffect, useState } from "react";

import { LogoMark } from "@/components/shared/logo-mark";
import { cn } from "@/lib/utils";

export function Preloader() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 1700);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-aaau-night transition duration-700",
        visible ? "opacity-100" : "opacity-0",
      )}
      aria-hidden={!visible}
    >
      <div className="relative flex h-56 w-56 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.03]">
        <div className="absolute inset-x-0 bottom-0 liquid-rise bg-[linear-gradient(180deg,#a71d3a,#6f1023)]" />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="rounded-full border border-white/[0.12] bg-black/[0.15] p-6 backdrop-blur-sm">
            <LogoMark className="h-16 w-16" />
          </div>
          <div className="text-center">
            <p className="font-display text-4xl uppercase tracking-[0.18em] text-white">
              AAAU
            </p>
            <p className="text-xs uppercase tracking-[0.34em] text-white/60">
              Brand Loading
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
