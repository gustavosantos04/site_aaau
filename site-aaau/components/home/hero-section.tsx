"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef } from "react";

import { buttonVariants } from "@/components/shared/button";
import { LogoMark } from "@/components/shared/logo-mark";
import { featuredStats } from "@/lib/data/seed-content";
import { getGsap } from "@/lib/animations/gsap";

const BulldogStage = dynamic(
  () => import("@/components/three/bulldog-stage").then((mod) => mod.BulldogStage),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] items-center justify-center rounded-[2rem] border border-white/10 bg-white/[0.03] text-sm uppercase tracking-[0.2em] text-white/50">
        Loading mascot
      </div>
    ),
  },
);

export function HeroSection() {
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const { gsap } = getGsap();
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".hero-copy > *",
        { opacity: 0, y: 32 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          stagger: 0.12,
          ease: "power3.out",
        },
      );
      gsap.fromTo(
        ".hero-card",
        { opacity: 0, x: 34 },
        {
          opacity: 1,
          x: 0,
          duration: 1,
          delay: 0.3,
          ease: "power3.out",
        },
      );
    }, heroRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={heroRef}
      className="relative overflow-hidden border-b border-white/10"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(167,29,58,0.28),transparent_34%),linear-gradient(180deg,#090909_0%,#110a0d_42%,#090909_100%)]" />
      <div className="absolute inset-0 bg-hero-grid bg-[length:54px_54px] opacity-[0.08]" />
      <div className="absolute right-[-10%] top-10 h-72 w-72 rounded-full bg-aaau-ember/[0.25] blur-[120px]" />
      <div className="absolute left-[-5%] top-1/2 h-52 w-52 rounded-full bg-white/10 blur-[140px]" />

      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 md:py-20 lg:grid-cols-[1.02fr,0.98fr] lg:px-8 lg:py-24">
        <div className="hero-copy flex flex-col justify-center gap-7">
          <div className="inline-flex w-fit items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2">
            <LogoMark className="h-7 w-7" />
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-white/70">
              Drop inaugural AAAU
            </span>
          </div>

          <div className="space-y-5">
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-white/55">
              Associação Atlética Acadêmica Uniritter
            </p>
            <h1 className="max-w-3xl font-display text-6xl uppercase leading-[0.9] tracking-[0.06em] text-white sm:text-7xl lg:text-8xl">
              Marca esportiva universitária com energia de jogo.
            </h1>
            <p className="max-w-2xl text-base leading-8 text-white/[0.72] md:text-lg">
              Uma plataforma digital pensada para fortalecer a identidade da AAAU,
              lançar produtos com presença premium e aproximar a gestão da
              comunidade em uma experiência mobile-first.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/produtos"
              className={buttonVariants({ variant: "primary", size: "lg" })}
            >
              Comprar coleção
            </Link>
            <Link
              href="/#sobre"
              className={buttonVariants({ variant: "secondary", size: "lg" })}
            >
              Conhecer a AAAU
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {featuredStats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-4"
              >
                <p className="font-display text-4xl uppercase tracking-[0.08em] text-white">
                  {stat.value}
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/[0.45]">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-card relative">
          <div className="absolute inset-x-8 top-10 z-10 hidden rounded-[1.6rem] border border-white/10 bg-black/25 p-4 backdrop-blur-md sm:block">
            <p className="text-xs uppercase tracking-[0.26em] text-white/50">
              Hero placeholder para vídeo/fotografia
            </p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {["Treino", "Arquibancada", "Drop 2026"].map((label) => (
                <div
                  key={label}
                  className="rounded-[1rem] border border-white/[0.08] bg-white/[0.04] px-4 py-6 text-center text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-white/[0.65]"
                >
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5 pt-24 shadow-glow">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(167,29,58,0.22),transparent_42%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(9,9,9,0.25)_70%,rgba(9,9,9,0.7)_100%)]" />
            <div className="relative hidden md:block">
              <BulldogStage />
            </div>
            <div className="relative flex min-h-[320px] items-center justify-center md:hidden">
              <div className="flex h-52 w-52 items-center justify-center rounded-full border border-white/10 bg-[radial-gradient(circle_at_top,rgba(167,29,58,0.45),rgba(9,9,9,0.92))]">
                <LogoMark className="h-24 w-24" />
              </div>
            </div>
            <div className="relative mt-4 flex items-center justify-between rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
              <div>
                <p className="text-xs uppercase tracking-[0.26em] text-white/[0.45]">
                  Mascote / suporte visual
                </p>
                <p className="mt-2 font-display text-3xl uppercase tracking-[0.08em] text-white">
                  Bulldog
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-white/55" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
