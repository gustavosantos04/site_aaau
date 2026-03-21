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
        className="absolute left-[-24vw] top-[11%] z-[1] w-[68vw] max-w-[820px] opacity-[0.46] sm:left-[-14vw] sm:w-[54vw] sm:opacity-[0.62] md:left-[-10vw] md:w-[42vw] md:opacity-[0.74] lg:left-[-6vw] lg:top-[10%] lg:w-[34vw] lg:opacity-[0.9]"
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
        className="absolute bottom-[18%] right-[-24vw] z-[1] w-[64vw] max-w-[760px] opacity-[0.42] sm:bottom-[12%] sm:right-[-14vw] sm:w-[50vw] sm:opacity-[0.58] md:bottom-[2%] md:right-[-8vw] md:w-[40vw] md:opacity-[0.7] lg:bottom-[4%] lg:right-[-5vw] lg:w-[31vw] lg:opacity-[0.88]"
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
