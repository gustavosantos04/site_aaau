"use client";

import { useRef, type CSSProperties } from "react";
import {
  CalendarRange,
  Crown,
  Handshake,
  Megaphone,
  Scale,
  Trophy,
} from "lucide-react";

import { ManagementCardPanel } from "@/components/home/management/management-card-panel";
import { getGsap } from "@/lib/animations/gsap";
import type { ManagementArea } from "@/lib/data/management";
import { cn } from "@/lib/utils";

const iconMap = {
  trophy: Trophy,
  crown: Crown,
  megaphone: Megaphone,
  calendar: CalendarRange,
  handshake: Handshake,
  scale: Scale,
} as const;

export function ManagementCard({
  area,
  isActive,
  isDimmed,
  mode = "desktop",
  onSelect,
  onClose,
  registerCard,
  registerFlip,
  className,
}: {
  area: ManagementArea;
  isActive: boolean;
  isDimmed?: boolean;
  mode?: "desktop" | "mobile";
  onSelect: () => void;
  onClose: () => void;
  registerCard?: (node: HTMLDivElement | null) => void;
  registerFlip?: (node: HTMLDivElement | null) => void;
  className?: string;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const Icon = iconMap[area.icon];

  const cardStyle = {
    "--card-glow": area.palette.glow,
    "--card-edge": area.palette.edge,
    "--card-veil": area.palette.veil,
  } as CSSProperties;

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (mode !== "desktop" || isActive) {
      return;
    }

    const shell = shellRef.current;
    const glare = glareRef.current;

    if (!shell || !glare) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = (event.clientX - bounds.left) / bounds.width - 0.5;
    const pointerY = (event.clientY - bounds.top) / bounds.height - 0.5;
    const { gsap } = getGsap();

    gsap.to(shell, {
      rotateY: pointerX * 16,
      rotateX: pointerY * -14,
      y: -10,
      duration: 0.35,
      ease: "power2.out",
      overwrite: true,
    });

    gsap.to(glare, {
      xPercent: pointerX * 38,
      yPercent: pointerY * 26,
      opacity: 0.9,
      duration: 0.3,
      ease: "power2.out",
      overwrite: true,
    });
  };

  const resetPointer = () => {
    const shell = shellRef.current;
    const glare = glareRef.current;

    if (!shell || !glare) {
      return;
    }

    const { gsap } = getGsap();

    gsap.to(shell, {
      rotateX: 0,
      rotateY: 0,
      y: 0,
      duration: 0.7,
      ease: "power3.out",
      overwrite: true,
    });

    gsap.to(glare, {
      xPercent: 0,
      yPercent: 0,
      opacity: 0.38,
      duration: 0.55,
      ease: "power3.out",
      overwrite: true,
    });
  };

  return (
    <div
      ref={registerCard}
      style={cardStyle}
      className={cn(
        "management-card absolute left-1/2 top-1/2 h-[25.5rem] w-[17.75rem] -translate-x-1/2 -translate-y-1/2 [transform-style:preserve-3d]",
        mode === "mobile" &&
          "relative left-auto top-auto h-[24rem] w-[17rem] translate-x-0 translate-y-0 shrink-0 snap-center",
        className,
      )}
    >
      <div
        ref={shellRef}
        className={cn(
          "relative h-full w-full rounded-[2rem] [transform-style:preserve-3d] transition-shadow duration-500",
          isActive
            ? "shadow-[0_50px_140px_rgba(0,0,0,0.6)]"
            : "shadow-[0_24px_90px_rgba(0,0,0,0.36)]",
          isDimmed && "shadow-[0_12px_40px_rgba(0,0,0,0.26)]",
        )}
      >
        <div
          ref={registerFlip}
          className="relative h-full w-full rounded-[inherit] overflow-hidden [transform-style:preserve-3d]"
        >
          <div
            data-face="front"
            className={cn(
              "absolute inset-0 z-10 rounded-[inherit] will-change-transform",
              isActive && "pointer-events-none",
            )}
          >
            <button
              type="button"
              aria-pressed={isActive}
              onClick={onSelect}
              onPointerMove={handlePointerMove}
              onPointerLeave={resetPointer}
              className="block h-full w-full rounded-[inherit] text-left"
            >
              <div className="absolute inset-0 rounded-[inherit] bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.03)_30%,rgba(255,255,255,0.01)_58%,rgba(255,255,255,0.08))]" />
              <div className="absolute inset-[1px] rounded-[calc(2rem-1px)] border border-[var(--card-edge)] bg-[radial-gradient(circle_at_top_left,var(--card-glow),transparent_34%),radial-gradient(circle_at_70%_100%,var(--card-veil),transparent_36%),linear-gradient(180deg,rgba(15,15,17,0.92),rgba(5,5,6,0.98))]" />
              <div className="deck-grid absolute inset-[1px] rounded-[calc(2rem-1px)] opacity-45" />
              <div className="deck-noise absolute inset-0 rounded-[inherit] opacity-45" />

              <div
                ref={glareRef}
                className="pointer-events-none absolute inset-[-20%] rounded-[inherit] bg-[radial-gradient(circle,rgba(255,255,255,0.32),transparent_42%)] opacity-40 blur-3xl"
              />

              <div className="pointer-events-none absolute inset-x-[8%] top-5 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
              <div className="pointer-events-none absolute inset-x-[8%] bottom-5 h-px bg-gradient-to-r from-transparent via-white/16 to-transparent" />

              <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-[inherit] p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="block font-display text-4xl uppercase leading-none text-white">
                      {area.symbol}
                    </span>
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.32em] text-white/42">
                      AAAU
                    </span>
                  </div>

                  <div className="flex h-14 w-14 items-center justify-center rounded-[1.15rem] border border-white/12 bg-white/[0.06] text-white/86 backdrop-blur transition-all duration-300 group-hover:border-white/20 group-hover:bg-white/[0.1]">
                    <Icon className="h-6 w-6 stroke-[1.6]" />
                  </div>
                </div>

                <div className="pointer-events-none absolute inset-x-0 top-[26%] text-center font-display text-[10rem] uppercase leading-none tracking-[0.1em] text-white/[0.04]">
                  {area.symbol}
                </div>

                <div className="relative space-y-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-white/44">
                      Gestao Institucional
                    </p>
                    <h3 className="mt-3 max-w-[10ch] font-display text-[2.3rem] uppercase leading-[0.92] tracking-[0.08em] text-white">
                      {area.title}
                    </h3>
                  </div>

                  <p className="max-w-[16rem] text-sm leading-6 text-white/64 font-medium">
                    {area.motto}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/42">
                      Equipe
                    </p>
                    <p className="mt-2 font-display text-2xl uppercase tracking-[0.08em] text-white">
                      {String(area.members.length).padStart(2, "0")}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/42">
                      Clique para abrir
                    </p>
                    <p className="mt-2 text-xs text-white/68 font-semibold">-&gt;</p>
                  </div>
                </div>

                <div className="absolute bottom-5 right-5 rotate-180 text-right">
                  <span className="block font-display text-4xl uppercase leading-none text-white/92">
                    {area.symbol}
                  </span>
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.32em] text-white/42">
                    AAAU
                  </span>
                </div>
              </div>
            </button>
          </div>

          <div
            data-face="back"
            className={cn(
              "absolute inset-0 z-20 opacity-0 will-change-transform",
              isActive ? "pointer-events-auto" : "pointer-events-none",
            )}
          >
            <ManagementCardPanel area={area} onClose={onClose} compact={mode === "mobile"} />
          </div>
        </div>
      </div>
    </div>
  );
}
