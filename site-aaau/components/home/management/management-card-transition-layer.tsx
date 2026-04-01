"use client";

import { useLayoutEffect, useRef } from "react";

import { ManagementCardPanel } from "@/components/home/management/management-card-panel";
import { getGsap } from "@/lib/animations/gsap";
import type { ManagementArea } from "@/lib/data/management";
import { cn } from "@/lib/utils";

export type ManagementTransitionPhase =
  | "idle"
  | "opening"
  | "steady"
  | "switching"
  | "closing";

export function ManagementCardTransitionLayer({
  currentArea,
  outgoingArea,
  phase,
  onClose,
}: {
  currentArea: ManagementArea | null;
  outgoingArea: ManagementArea | null;
  phase: ManagementTransitionPhase;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);
  const outgoingRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const current = currentRef.current;
    const outgoing = outgoingRef.current;

    if (!container) {
      return;
    }

    const { gsap } = getGsap();
    const ctx = gsap.context(() => {
      gsap.set(container, { autoAlpha: phase === "idle" ? 0 : 1 });

      if (current) {
        gsap.set(current, {
          x: 0,
          y: 0,
          scale: 1,
          rotate: 0,
          autoAlpha: 1,
          filter: "blur(0px)",
        });
      }

      if (outgoing) {
        gsap.set(outgoing, {
          x: 0,
          y: 0,
          scale: 1,
          rotate: 0,
          autoAlpha: 1,
          filter: "blur(0px)",
        });
      }

      if (phase === "opening" && current) {
        gsap.fromTo(
          current,
          {
            x: 56,
            y: 18,
            scale: 0.95,
            rotate: 4,
            autoAlpha: 0.72,
            filter: "blur(10px)",
          },
          {
            x: 0,
            y: 0,
            scale: 1,
            rotate: 0,
            autoAlpha: 1,
            filter: "blur(0px)",
            duration: 0.62,
            ease: "expo.out",
            overwrite: true,
          },
        );
      }

      if (phase === "steady" && current) {
        gsap.set(current, { autoAlpha: 1 });
      }

      if (phase === "switching" && current && outgoing) {
        gsap.set(current, {
          x: 68,
          y: 18,
          scale: 0.95,
          rotate: 4,
          autoAlpha: 0.78,
          filter: "blur(12px)",
        });

        const tl = gsap.timeline({ defaults: { overwrite: true } });

        tl.to(
          outgoing,
          {
            x: -34,
            y: -10,
            scale: 0.975,
            rotate: -2,
            autoAlpha: 0.34,
            filter: "blur(10px)",
            duration: 0.54,
            ease: "power3.inOut",
          },
          0,
        );

        tl.to(
          current,
          {
            x: 0,
            y: 0,
            scale: 1,
            rotate: 0,
            autoAlpha: 1,
            filter: "blur(0px)",
            duration: 0.66,
            ease: "expo.out",
          },
          0.08,
        );
      }

      if (phase === "closing" && outgoing) {
        gsap.to(outgoing, {
          x: -28,
          y: -14,
          scale: 0.96,
          rotate: -2,
          autoAlpha: 0,
          filter: "blur(8px)",
          duration: 0.46,
          ease: "power3.inOut",
          overwrite: true,
        });
      }
    }, container);

    return () => ctx.revert();
  }, [currentArea?.id, outgoingArea?.id, phase]);

  if (!currentArea && !outgoingArea) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute left-1/2 top-1/2 z-[260] hidden h-[32.5rem] w-[47.5rem] lg:block"
      style={{
        transform: "translate(calc(-50% - 48px), calc(-50% + 8px))",
      }}
    >
      {outgoingArea ? (
        <div
          ref={outgoingRef}
          className={cn(
            "absolute inset-0 will-change-transform",
            currentArea ? "z-10" : "z-20",
          )}
        >
          <ManagementCardPanel area={outgoingArea} className="h-full shadow-[0_34px_110px_rgba(0,0,0,0.4)]" />
        </div>
      ) : null}

      {currentArea ? (
        <div ref={currentRef} className="pointer-events-auto absolute inset-0 z-20 will-change-transform">
          <ManagementCardPanel
            area={currentArea}
            onClose={onClose}
            className="h-full shadow-[0_34px_110px_rgba(0,0,0,0.44)]"
          />
        </div>
      ) : null}
    </div>
  );
}
