import Link from "next/link";
import type { RefObject } from "react";

import { buttonVariants } from "@/components/shared/button";

export function HeroContent({
  contentRef,
}: {
  contentRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={contentRef}
      className="relative mx-auto flex max-w-5xl flex-col items-center text-center"
    >
      <div className="pointer-events-none absolute inset-x-0 top-1/2 hidden -translate-y-1/2 font-display text-[22vw] uppercase tracking-[0.12em] text-white/[0.04] lg:block">
        Bulldogs
      </div>

      <p
        data-hero-copy
        className="max-w-full rounded-full border border-white/[0.12] bg-black/[0.26] px-3 py-2 text-[0.58rem] font-semibold uppercase tracking-[0.24em] text-white/70 backdrop-blur-md sm:px-4 sm:text-[0.68rem] sm:tracking-[0.34em]"
      >
        Associacao Atletica Academica Uniritter
      </p>

      <h1
        data-hero-copy
        className="mt-5 max-w-5xl text-balance font-display text-[17vw] uppercase leading-[0.9] tracking-[0.04em] text-white sm:mt-6 sm:text-[5.4rem] lg:text-[8.6rem]"
      >
        1,2,3... AAAU!
      </h1>

      <p
        data-hero-copy
        className="mt-4 max-w-[36rem] text-sm leading-6 text-white/[0.76] sm:mt-5 sm:text-base sm:leading-7 md:text-lg"
      >
        A AAAU entra em campo com marca forte, barulho de arquibancada e presenca
        premium. Uma hero viva para vender produto, identidade e energia
        universitaria.
      </p>

      <div data-hero-copy className="mt-7 flex w-full max-w-xl flex-col gap-3 sm:mt-8 sm:flex-row sm:justify-center">
        <Link
          href="/#sobre"
          className={buttonVariants({
            variant: "secondary",
            size: "lg",
            className: "w-full sm:min-w-[220px] sm:w-auto",
          })}
        >
          Conheca a Atletica
        </Link>
        <Link
          href="/produtos"
          className={buttonVariants({
            variant: "primary",
            size: "lg",
            className: "w-full sm:min-w-[220px] sm:w-auto",
          })}
        >
          Vista-se de AAAU
        </Link>
      </div>
    </div>
  );
}
