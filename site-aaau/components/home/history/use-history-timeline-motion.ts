"use client";

import { useLayoutEffect, useRef } from "react";
import { getGsap } from "@/lib/animations/gsap";

export function useHistoryTimelineMotion() {
  const sectionRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const lastCardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const { gsap, ScrollTrigger } = getGsap();
    
    if (!sectionRef.current || !containerRef.current || !cardsRef.current || !lastCardRef.current) return;

    const ctx = gsap.context(() => {
      const cards = gsap.utils.toArray<HTMLElement>(".timeline-card");
      const totalCards = cards.length;
      
      // 1. Horizontal Scroll Timeline
      // We calculate the scroll distance based on the width of the cards container
      const scrollDistance = cardsRef.current!.scrollWidth - window.innerWidth;
      
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

      // 2. Cinematic Transition on Last Card
      // This part happens at the end of the horizontal scroll
      const transitionStart = scrollDistance / (scrollDistance + 1500);
      
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

      // Zoom into the last card (The "Dive" effect)
      // We scale it up massively to give the feeling of "entering" it
      mainTl.to(lastCardRef.current, {
        scale: 20,
        opacity: 0,
        duration: 1.2,
        ease: "power2.in",
      }, ">");

      // Background flash/glow effect during transition
      mainTl.to(sectionRef.current, {
        backgroundColor: "#ffffff",
        duration: 0.2,
      }, ">-0.4");
      
      mainTl.to(sectionRef.current, {
        backgroundColor: "#090909",
        duration: 0.4,
      }, ">");

    });

    return () => ctx.revert();
  }, []);

  return {
    sectionRef,
    containerRef,
    cardsRef,
    lastCardRef,
  };
}
