"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

let isRegistered = false;

export function getGsap() {
  if (!isRegistered && typeof window !== "undefined") {
    gsap.registerPlugin(ScrollTrigger);
    isRegistered = true;
  }

  return { gsap, ScrollTrigger };
}
