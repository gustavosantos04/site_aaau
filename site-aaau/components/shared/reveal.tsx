"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { getGsap } from "@/lib/animations/gsap";

export function Reveal({
  children,
  y = 40,
  delay = 0,
}: {
  children: ReactNode;
  y?: number;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const { gsap } = getGsap();

    const ctx = gsap.context(() => {
      gsap.fromTo(
        ref.current,
        { opacity: 0, y },
        {
          opacity: 1,
          y: 0,
          delay,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: ref.current,
            start: "top 85%",
          },
        },
      );
    }, ref);

    return () => ctx.revert();
  }, [delay, y]);

  return <div ref={ref}>{children}</div>;
}
