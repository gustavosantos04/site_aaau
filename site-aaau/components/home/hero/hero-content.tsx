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
        className="rounded-full border border-white/[0.12] bg-black/[0.26] px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.34em] text-white/70 backdrop-blur-md"
      >
        Associacao Atletica Academica Uniritter
      </p>

      <h1
        data-hero-copy
        className="mt-6 max-w-5xl font-display text-[17vw] uppercase leading-[0.88] tracking-[0.05em] text-white sm:text-[5.9rem] lg:text-[8.6rem]"
      >
        1,2,3... AAAU!
      </h1>

      <p
        data-hero-copy
        className="mt-5 max-w-2xl text-sm leading-7 text-white/[0.76] sm:text-base md:text-lg"
      >
        A AAAU entra em campo com marca forte, barulho de arquibancada e presenca
        premium. Uma hero viva para vender produto, identidade e energia
        universitaria.
      </p>

      <div data-hero-copy className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/#sobre"
          className={buttonVariants({
            variant: "secondary",
            size: "lg",
            className: "min-w-[220px]",
          })}
        >
          Conheca a Atletica
        </Link>
        <Link
          href="/produtos"
          className={buttonVariants({
            variant: "primary",
            size: "lg",
            className: "min-w-[220px]",
          })}
        >
          Vista-se de AAAU
        </Link>
      </div>
    </div>
  );
}
