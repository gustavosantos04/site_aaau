import Image from "next/image";
import type { RefObject } from "react";

export function HeroMascots({
  leftRef,
  rightRef,
}: {
  leftRef: RefObject<HTMLDivElement | null>;
  rightRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        ref={leftRef}
        className="absolute left-[-18vw] top-[12%] z-[1] w-[58vw] max-w-[820px] opacity-[0.9] sm:left-[-12vw] sm:w-[52vw] md:left-[-10vw] md:w-[42vw] lg:left-[-6vw] lg:top-[10%] lg:w-[34vw]"
      >
        <div className="absolute inset-[12%] rounded-full bg-aaau-ember/[0.35] blur-[100px]" />
        <div className="absolute left-[18%] top-[16%] h-[70%] w-[58%] rounded-full border border-white/[0.08]" />
        <Image
          src="/images/mascots/hero/bulldog-left.png"
          alt="Mascote bulldog da AAAU no lado esquerdo da hero"
          width={1200}
          height={1600}
          priority
          className="hero-mascot-left relative h-auto w-full object-contain drop-shadow-[0_25px_55px_rgba(0,0,0,0.55)]"
        />
      </div>

      <div
        ref={rightRef}
        className="absolute bottom-[6%] right-[-18vw] z-[1] w-[56vw] max-w-[760px] opacity-[0.88] sm:right-[-12vw] sm:w-[50vw] md:bottom-[2%] md:right-[-8vw] md:w-[40vw] lg:bottom-[4%] lg:right-[-5vw] lg:w-[31vw]"
      >
        <div className="absolute inset-[14%] rounded-full bg-white/[0.12] blur-[90px]" />
        <div className="absolute left-[10%] top-[12%] h-[66%] w-[62%] rounded-full border border-aaau-ember/[0.28]" />
        <Image
          src="/images/mascots/hero/bulldog-right.png"
          alt="Mascote bulldog da AAAU no lado direito da hero"
          width={1200}
          height={1600}
          priority
          className="hero-mascot-right relative h-auto w-full object-contain drop-shadow-[0_25px_55px_rgba(0,0,0,0.55)]"
        />
      </div>
    </div>
  );
}
