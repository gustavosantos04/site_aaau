"use client";

import type { CSSProperties, RefObject } from "react";

const pawPrints = [
  { left: "0%", top: "42%", rotate: "-12deg", size: 1 },
  { left: "16%", top: "25%", rotate: "8deg", size: 0.92 },
  { left: "34%", top: "45%", rotate: "-10deg", size: 1.05 },
  { left: "52%", top: "22%", rotate: "11deg", size: 0.94 },
  { left: "70%", top: "44%", rotate: "-9deg", size: 1.06 },
  { left: "88%", top: "20%", rotate: "13deg", size: 0.9 },
];

const pawTrails = [
  {
    id: "trail-1",
    className:
      "left-[-6%] top-[14%] w-[26rem] rotate-[-16deg] opacity-[0.28] sm:w-[30rem] lg:opacity-[0.38]",
    depth: 22,
    style: {
      "--trail-start-x": "-10%",
      "--trail-start-y": "-4%",
      "--trail-end-x": "16%",
      "--trail-end-y": "10%",
      "--trail-scale": "1",
      "--trail-rotate": "-16deg",
      animationDelay: "0s",
      animationDuration: "18s",
    } as CSSProperties,
  },
  {
    id: "trail-2",
    className:
      "left-[18%] top-[12%] w-[22rem] rotate-[14deg] opacity-[0.18] sm:w-[28rem] lg:opacity-[0.3]",
    depth: 14,
    style: {
      "--trail-start-x": "-8%",
      "--trail-start-y": "0%",
      "--trail-end-x": "12%",
      "--trail-end-y": "12%",
      "--trail-scale": "0.92",
      "--trail-rotate": "14deg",
      animationDelay: "3.2s",
      animationDuration: "20s",
    } as CSSProperties,
  },
  {
    id: "trail-3",
    className:
      "right-[-8%] top-[28%] w-[24rem] rotate-[20deg] opacity-[0.2] sm:w-[30rem] lg:opacity-[0.32]",
    depth: 18,
    style: {
      "--trail-start-x": "8%",
      "--trail-start-y": "-3%",
      "--trail-end-x": "-16%",
      "--trail-end-y": "14%",
      "--trail-scale": "1.04",
      "--trail-rotate": "20deg",
      animationDelay: "6.4s",
      animationDuration: "19s",
    } as CSSProperties,
  },
  {
    id: "trail-4",
    className:
      "left-[8%] bottom-[16%] w-[28rem] rotate-[8deg] opacity-[0.16] sm:w-[32rem] lg:opacity-[0.26]",
    depth: 12,
    style: {
      "--trail-start-x": "-12%",
      "--trail-start-y": "6%",
      "--trail-end-x": "14%",
      "--trail-end-y": "-10%",
      "--trail-scale": "1.08",
      "--trail-rotate": "8deg",
      animationDelay: "1.8s",
      animationDuration: "17s",
    } as CSSProperties,
  },
];

function PawPrint({
  left,
  top,
  rotate,
  size,
  delay,
}: {
  left: string;
  top: string;
  rotate: string;
  size: number;
  delay: string;
}) {
  return (
    <div
      className="hero-paw-print absolute"
      style={
        {
          left,
          top,
          transform: `rotate(${rotate}) scale(${size})`,
          animationDelay: delay,
        } as CSSProperties
      }
    >
      <span className="hero-paw-toe left-[7px] top-0" />
      <span className="hero-paw-toe left-[22px] top-[-2px]" />
      <span className="hero-paw-toe left-[34px] top-[8px]" />
      <span className="hero-paw-toe left-[2px] top-[12px]" />
      <span className="hero-paw-pad" />
    </div>
  );
}

export function HeroBackgroundMedia({
  backgroundRef,
}: {
  backgroundRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={backgroundRef} className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(167,29,58,0.18),transparent_24%),linear-gradient(180deg,rgba(8,8,8,0.14),rgba(8,8,8,0.54)_42%,rgba(8,8,8,0.94)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,8,8,0.86)_0%,rgba(8,8,8,0.18)_24%,rgba(8,8,8,0.18)_76%,rgba(8,8,8,0.86)_100%)]" />
      <div className="absolute inset-0 bg-hero-grid bg-[length:64px_64px] opacity-[0.05]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_60%,rgba(255,255,255,0.04),transparent_30%)]" />

      {pawTrails.map((trail) => (
        <div
          key={trail.id}
          className={`hero-paw-trail absolute h-40 ${trail.className}`}
          style={trail.style}
        >
          <div className="relative h-full w-full" data-hero-paw-layer data-depth={trail.depth}>
            {pawPrints.map((print, index) => (
              <PawPrint
                key={`${trail.id}-${index}`}
                left={print.left}
                top={print.top}
                rotate={print.rotate}
                size={print.size}
                delay={`${index * 0.35}s`}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="absolute left-[12%] top-[20%] h-40 w-40 rounded-full bg-aaau-ember/[0.08] blur-[90px]" />
      <div className="absolute right-[16%] top-[26%] h-44 w-44 rounded-full bg-white/[0.05] blur-[100px]" />
      <div className="absolute bottom-[18%] left-[32%] h-48 w-48 rounded-full bg-aaau-wine/[0.08] blur-[110px]" />
    </div>
  );
}
