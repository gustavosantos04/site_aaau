"use client";

import { useLayoutEffect, useRef } from "react";
import { getGsap } from "@/lib/animations/gsap";

export function useHistoryTimelineMotion() {
  const sectionRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const lastCardRef = useRef<HTMLDivElement>(null);
  const historyStageRef = useRef<HTMLDivElement>(null);
  const transitionLayerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const { gsap, ScrollTrigger } = getGsap();
    
    if (
      !sectionRef.current ||
      !containerRef.current ||
      !cardsRef.current ||
      !lastCardRef.current ||
      !historyStageRef.current ||
      !transitionLayerRef.current
    ) {
      return;
    }

    const ctx = gsap.context(() => {
      const cards = gsap.utils.toArray<HTMLElement>(".timeline-card");
      const totalCards = cards.length;
      const nextSection = document.getElementById("produtos");
      const nextStage = nextSection?.querySelector<HTMLElement>("[data-products-stage]") ?? null;
      
      // 1. Horizontal Scroll Timeline
      // We calculate the scroll distance based on the width of the cards container
      const scrollDistance = cardsRef.current!.scrollWidth - window.innerWidth;

      gsap.set(historyStageRef.current, { opacity: 1, filter: "blur(0px)" });
      gsap.set(transitionLayerRef.current, { opacity: 0 });

      if (nextSection) {
        gsap.set(nextSection, { opacity: 0, y: 96, filter: "blur(14px)" });
      }

      if (nextStage) {
        gsap.set(nextStage, { opacity: 0, y: 48 });
      }
      
      const mainTl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: () => `+=${scrollDistance + 1500}`, // Extra space for the final transition
          pin: true,
          scrub: 1,
          invalidateOnRefresh: true,
        }
      });

      // Move cards horizontally
      mainTl.to(cardsRef.current, {
        x: () => -scrollDistance,
        ease: "none",
      });

      // 2. Reduce the weight of the previous cards and isolate the final one
      // Focus on last card and dim others
      cards.forEach((card, i) => {
        if (i !== totalCards - 1) {
          mainTl.to(card, {
            opacity: 0,
            scale: 0.8,
            filter: "blur(20px)",
            duration: 0.3,
          }, ">-0.1");
        }
      });

      // 3. Final focus on the last card
      mainTl.to(lastCardRef.current, {
        scale: 1.08,
        duration: 0.45,
        ease: "power2.out",
      }, ">");

      // 4. Hold the screen in a dedicated transition state
      mainTl.to(transitionLayerRef.current, {
        opacity: 1,
        duration: 0.35,
        ease: "power2.inOut",
      }, ">");

      mainTl.to(historyStageRef.current, {
        opacity: 0,
        filter: "blur(18px)",
        duration: 0.25,
        ease: "power2.inOut",
      }, "<");

      // 5. Only after the transition layer is dominant do products appear
      if (nextSection) {
        mainTl.to(nextSection, {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.55,
          ease: "power3.out",
        }, ">");
      }

      if (nextStage) {
        mainTl.to(nextStage, {
          opacity: 1,
          y: 0,
          duration: 0.45,
          ease: "power3.out",
        }, "<0.05");
      }

      mainTl.to(transitionLayerRef.current, {
        opacity: 0,
        duration: 0.4,
        ease: "power2.out",
      }, ">-0.08");

    });

    return () => ctx.revert();
  }, []);

  return {
    sectionRef,
    containerRef,
    cardsRef,
    lastCardRef,
    historyStageRef,
    transitionLayerRef,
  };
}
