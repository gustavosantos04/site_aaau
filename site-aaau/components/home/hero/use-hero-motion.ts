"use client";

import { useEffect, type RefObject } from "react";

import { getGsap } from "@/lib/animations/gsap";

export function useHeroMotion({
  rootRef,
  backgroundRef,
  contentRef,
  leftRef,
  rightRef,
  atmosphereRef,
}: {
  rootRef: RefObject<HTMLElement | null>;
  backgroundRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  leftRef: RefObject<HTMLDivElement | null>;
  rightRef: RefObject<HTMLDivElement | null>;
  atmosphereRef: RefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const { gsap } = getGsap();
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-hero-copy]",
        { opacity: 0, y: 28 },
        {
          opacity: 1,
          y: 0,
          duration: 0.95,
          stagger: 0.1,
          ease: "power3.out",
        },
      );

      gsap.fromTo(
        [leftRef.current, rightRef.current],
        { opacity: 0, scale: 0.92 },
        {
          opacity: 1,
          scale: 1,
          duration: 1.1,
          stagger: 0.12,
          ease: "power3.out",
        },
      );

      if (leftRef.current) {
        gsap.to(leftRef.current, {
          y: -12,
          rotation: -1.6,
          duration: 4.6,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });
      }

      if (rightRef.current) {
        gsap.to(rightRef.current, {
          y: 14,
          rotation: 1.8,
          duration: 5.1,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });
      }

      if (atmosphereRef.current) {
        gsap.to(atmosphereRef.current, {
          y: -10,
          duration: 6,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });
      }
    }, root);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isDesktop = window.matchMedia("(min-width: 768px)").matches;

    if (reduceMotion || !isDesktop) {
      return () => ctx.revert();
    }

    const moveBackgroundX = gsap.quickTo(backgroundRef.current, "x", {
      duration: 1.1,
      ease: "power3.out",
    });
    const moveBackgroundY = gsap.quickTo(backgroundRef.current, "y", {
      duration: 1.1,
      ease: "power3.out",
    });
    const moveContentX = gsap.quickTo(contentRef.current, "x", {
      duration: 0.9,
      ease: "power3.out",
    });
    const moveContentY = gsap.quickTo(contentRef.current, "y", {
      duration: 0.9,
      ease: "power3.out",
    });
    const moveLeftX = gsap.quickTo(leftRef.current, "x", {
      duration: 0.9,
      ease: "power3.out",
    });
    const moveLeftY = gsap.quickTo(leftRef.current, "y", {
      duration: 0.9,
      ease: "power3.out",
    });
    const moveRightX = gsap.quickTo(rightRef.current, "x", {
      duration: 0.9,
      ease: "power3.out",
    });
    const moveRightY = gsap.quickTo(rightRef.current, "y", {
      duration: 0.9,
      ease: "power3.out",
    });
    const pawLayers = Array.from(
      root.querySelectorAll<HTMLElement>("[data-hero-paw-layer]"),
    ).map((layer) => ({
      layer,
      depth: Number(layer.dataset.depth ?? 12),
      moveX: gsap.quickTo(layer, "x", {
        duration: 0.85,
        ease: "power3.out",
      }),
      moveY: gsap.quickTo(layer, "y", {
        duration: 0.85,
        ease: "power3.out",
      }),
    }));

    const handleMove = (event: PointerEvent) => {
      const bounds = root.getBoundingClientRect();
      const relativeX = (event.clientX - bounds.left) / bounds.width - 0.5;
      const relativeY = (event.clientY - bounds.top) / bounds.height - 0.5;

      moveBackgroundX(relativeX * -18);
      moveBackgroundY(relativeY * -18);
      moveContentX(relativeX * 10);
      moveContentY(relativeY * 8);
      moveLeftX(relativeX * -24);
      moveLeftY(relativeY * -18);
      moveRightX(relativeX * 24);
      moveRightY(relativeY * 18);
      pawLayers.forEach(({ depth, moveX, moveY }) => {
        moveX(relativeX * depth * 1.2);
        moveY(relativeY * depth);
      });
    };

    const handleLeave = () => {
      moveBackgroundX(0);
      moveBackgroundY(0);
      moveContentX(0);
      moveContentY(0);
      moveLeftX(0);
      moveLeftY(0);
      moveRightX(0);
      moveRightY(0);
      pawLayers.forEach(({ moveX, moveY }) => {
        moveX(0);
        moveY(0);
      });
    };

    root.addEventListener("pointermove", handleMove);
    root.addEventListener("pointerleave", handleLeave);

    return () => {
      root.removeEventListener("pointermove", handleMove);
      root.removeEventListener("pointerleave", handleLeave);
      ctx.revert();
    };
  }, [atmosphereRef, backgroundRef, contentRef, leftRef, rightRef, rootRef]);
}
