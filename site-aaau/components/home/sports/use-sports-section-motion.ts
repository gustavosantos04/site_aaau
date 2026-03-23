"use client";

import { useLayoutEffect, useRef } from "react";
import { getGsap } from "@/lib/animations/gsap";

export function useSportsSectionMotion() {
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  const clawMarksRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const { gsap, ScrollTrigger } = getGsap();
    
    if (!sectionRef.current || !headingRef.current || !cardsRef.current || !veilRef.current || !clawMarksRef.current) return;

    const ctx = gsap.context(() => {
      const cards = gsap.utils.toArray<HTMLElement>(".sport-card");
      const bulls = gsap.utils.toArray<HTMLElement>(".sport-bull");
      const claws = gsap.utils.toArray<HTMLElement>(".claw-mark");

      // 1. Initial States (Explicitly set to avoid flashes)
      gsap.set(veilRef.current, { scaleY: 1, transformOrigin: "top", opacity: 1 });
      gsap.set(claws, { scaleX: 0, opacity: 0, transformOrigin: "left" });
      gsap.set(headingRef.current, { y: 100, opacity: 0 });
      gsap.set(cards, { y: 150, opacity: 0, scale: 0.85 });
      gsap.set(bulls, { y: 60, opacity: 0, scale: 0.7, filter: "brightness(0)" });

      // 2. Main Timeline with SCRUB
      // We start the animation when the section enters the viewport and finish when it's fully visible
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 90%", // Starts as soon as the section enters the viewport
          end: "bottom 80%", // Ends when the section is almost fully in view
          scrub: 1.2, // Smoothness of the scroll reaction
          invalidateOnRefresh: true,
        }
      });

      // Step 1: Claw Marks "Slash" (Fast at the beginning)
      tl.to(claws, {
        scaleX: 1,
        opacity: 1,
        duration: 0.2,
        stagger: 0.05,
        ease: "power4.inOut",
      });

      // Step 2: Impact / Veil Reveal
      tl.to(veilRef.current, {
        scaleY: 0,
        opacity: 0,
        duration: 0.6,
        ease: "expo.inOut",
      }, "-=0.1");

      // Step 3: Heading Entrance
      tl.to(headingRef.current, {
        y: 0,
        opacity: 1,
        duration: 0.5,
        ease: "power3.out",
      }, "-=0.3");

      // Step 4: Cards Stagger (Revealing as you scroll)
      tl.to(cards, {
        y: 0,
        opacity: 1,
        scale: 1,
        duration: 0.8,
        stagger: 0.1,
        ease: "back.out(1.2)",
      }, "-=0.4");

      // Step 5: Bulls "Pop" with Presence (Final touch)
      tl.to(bulls, {
        y: 0,
        opacity: 1,
        scale: 1,
        filter: "brightness(1)",
        duration: 1,
        stagger: 0.12,
        ease: "elastic.out(1, 0.6)",
      }, "-=0.6");

      // Step 6: Subtle Claw Marks persistence
      tl.to(claws, {
        opacity: 0.05,
        duration: 0.4,
      }, "-=0.4");

    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return {
    sectionRef,
    headingRef,
    cardsRef,
    veilRef,
    clawMarksRef,
  };
}
