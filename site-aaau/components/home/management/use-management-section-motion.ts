"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

import { getGsap } from "@/lib/animations/gsap";
import type { ManagementArea } from "@/lib/data/management";

export function useManagementSectionMotion({
  areas,
  activeId,
}: {
  areas: ManagementArea[];
  activeId: string | null;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const desktopStageRef = useRef<HTMLDivElement>(null);
  const mobileRailRef = useRef<HTMLDivElement>(null);
  const mobileDetailRef = useRef<HTMLDivElement>(null);

  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const flipRefs = useRef(new Map<string, HTMLDivElement>());
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  const registerCard = useCallback(
    (id: string) => (node: HTMLDivElement | null) => {
      if (node) {
        cardRefs.current.set(id, node);
        return;
      }

      cardRefs.current.delete(id);
    },
    [],
  );

  const registerFlip = useCallback(
    (id: string) => (node: HTMLDivElement | null) => {
      if (node) {
        flipRefs.current.set(id, node);
        return;
      }

      flipRefs.current.delete(id);
    },
    [],
  );

  useLayoutEffect(() => {
    const { gsap } = getGsap();
    const mm = gsap.matchMedia();

    mm.add("(min-width: 1024px)", () => {
      if (!sectionRef.current || !headingRef.current || !desktopStageRef.current) {
        return;
      }

      const ctx = gsap.context(() => {
        gsap.fromTo(
          headingRef.current,
          { autoAlpha: 0, y: 56 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.95,
            ease: "power3.out",
            scrollTrigger: {
              trigger: sectionRef.current,
              start: "top 76%",
            },
          },
        );

        gsap.fromTo(
          desktopStageRef.current,
          { autoAlpha: 0, y: 68, rotateX: 8, transformOrigin: "center top" },
          {
            autoAlpha: 1,
            y: 0,
            rotateX: 0,
            duration: 1.2,
            delay: 0.1,
            ease: "expo.out",
            scrollTrigger: {
              trigger: sectionRef.current,
              start: "top 72%",
            },
          },
        );
      }, sectionRef);

      return () => ctx.revert();
    });

    mm.add("(max-width: 1023px)", () => {
      if (!sectionRef.current || !headingRef.current || !mobileRailRef.current) {
        return;
      }

      const ctx = gsap.context(() => {
        gsap.fromTo(
          [headingRef.current, mobileRailRef.current],
          { autoAlpha: 0, y: 48 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.9,
            stagger: 0.08,
            ease: "power3.out",
            scrollTrigger: {
              trigger: sectionRef.current,
              start: "top 80%",
            },
          },
        );
      }, sectionRef);

      return () => ctx.revert();
    });

    return () => mm.revert();
  }, []);

  useLayoutEffect(() => {
    const { gsap } = getGsap();
    const mm = gsap.matchMedia();

    mm.add("(min-width: 1024px)", () => {
      const activeIndex = areas.findIndex((area) => area.id === activeId);
      const centerIndex = (areas.length - 1) / 2;

      if (timelineRef.current) {
        timelineRef.current.kill();
      }

      const tl = gsap.timeline({ overwrite: "auto" });
      timelineRef.current = tl;

      areas.forEach((area, index) => {
        const card = cardRefs.current.get(area.id);
        const flip = flipRefs.current.get(area.id);

        if (!card || !flip) {
          return;
        }

        const front = flip.querySelector<HTMLElement>('[data-face="front"]');
        const back = flip.querySelector<HTMLElement>('[data-face="back"]');

        if (!front || !back) {
          return;
        }

        const isSelected = area.id === activeId;
        const hasSelection = activeIndex >= 0;

        const x = hasSelection ? (isSelected ? -48 : 386) : (index - centerIndex) * 126;
        const y = hasSelection
          ? isSelected
            ? 8
            : -188 + index * 92
          : Math.abs(index - centerIndex) * 18;
        const rotate = hasSelection ? (isSelected ? 0 : 9) : (index - centerIndex) * 5.2;
        const width = hasSelection ? (isSelected ? 760 : 138) : 284;
        const height = hasSelection ? (isSelected ? 520 : 192) : 410;
        const brightness = hasSelection && !isSelected ? 0.75 : 1;
        const saturate = hasSelection && !isSelected ? 0.75 : 1;

        tl.to(
          card,
          {
            x,
            y,
            rotate,
            width,
            height,
            filter: `saturate(${saturate}) brightness(${brightness})`,
            zIndex: hasSelection ? (isSelected ? 240 : 110 + index) : 120 + index,
            duration: 0.9,
            ease: "expo.inOut",
          },
          0,
        );

        tl.to(
          front,
          {
            autoAlpha: isSelected ? 0.18 : 1,
            x: isSelected ? -20 : 0,
            y: isSelected ? -6 : 0,
            scale: isSelected ? 0.985 : 1,
            rotateY: isSelected ? -10 : 0,
            duration: isSelected ? 0.44 : 0.32,
            ease: "power2.out",
          },
          0,
        );

        tl.to(
          back,
          {
            autoAlpha: isSelected ? 1 : 0,
            x: isSelected ? 0 : 18,
            y: isSelected ? 0 : 6,
            scale: isSelected ? 1 : 0.985,
            rotateY: isSelected ? 0 : 10,
            duration: isSelected ? 0.62 : 0.28,
            ease: isSelected ? "expo.out" : "power2.inOut",
          },
          isSelected ? 0.08 : 0,
        );
      });
    });

    return () => mm.revert();
  }, [activeId, areas]);

  useLayoutEffect(() => {
    if (!mobileDetailRef.current || !activeId) {
      return;
    }

    const { gsap } = getGsap();

    gsap.fromTo(
      mobileDetailRef.current,
      { autoAlpha: 0, y: 40, rotateX: -10, scale: 0.96, transformOrigin: "center top" },
      {
        autoAlpha: 1,
        y: 0,
        rotateX: 0,
        scale: 1,
        duration: 0.9,
        ease: "expo.out",
      },
    );
  }, [activeId]);

  return {
    sectionRef,
    headingRef,
    desktopStageRef,
    mobileRailRef,
    mobileDetailRef,
    registerCard,
    registerFlip,
  };
}
