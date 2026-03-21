"use client";

import Image from "next/image";
import { useEffect, useState, type RefObject } from "react";

import { cn } from "@/lib/utils";
import type { HeroMediaItem } from "@/lib/data/hero-media";

export function HeroBackgroundMedia({
  items,
  backgroundRef,
}: {
  items: HeroMediaItem[];
  backgroundRef: RefObject<HTMLDivElement | null>;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % items.length);
    }, 6200);

    return () => window.clearInterval(timer);
  }, [items.length]);

  return (
    <div ref={backgroundRef} className="absolute inset-0 overflow-hidden">
      {items.map((item, index) => {
        const isActive = index === activeIndex;

        return (
          <div
            key={item.id}
            className={cn(
              "absolute inset-0 transition-opacity duration-[1400ms] ease-out",
              isActive ? "opacity-100" : "opacity-0",
            )}
          >
            {item.type === "video" ? (
              <video
                autoPlay
                muted
                loop
                playsInline
                poster={item.poster}
                className="hero-media-zoom h-full w-full object-cover"
              >
                <source src={item.src} />
              </video>
            ) : (
              <Image
                src={item.src}
                alt={item.alt}
                fill
                priority={index === 0}
                sizes="100vw"
                className="hero-media-zoom object-cover"
              />
            )}
          </div>
        );
      })}

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(167,29,58,0.28),transparent_30%),linear-gradient(180deg,rgba(8,8,8,0.18),rgba(8,8,8,0.68)_46%,rgba(8,8,8,0.94)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,8,8,0.82)_0%,rgba(8,8,8,0.16)_28%,rgba(8,8,8,0.16)_72%,rgba(8,8,8,0.82)_100%)]" />
      <div className="absolute inset-0 bg-hero-grid bg-[length:64px_64px] opacity-[0.06]" />
    </div>
  );
}
