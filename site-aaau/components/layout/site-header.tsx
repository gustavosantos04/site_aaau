"use client";

import Link from "next/link";
import type { Route } from "next";
import { ShoppingBag } from "lucide-react";

import { MobileNav } from "@/components/layout/mobile-nav";
import { BrandLogo } from "@/components/shared/brand-logo";
import { buttonVariants } from "@/components/shared/button";
import { useCart } from "@/features/cart/cart-provider";
import { siteConfig } from "@/lib/site";

export function SiteHeader() {
  const { items, openCart } = useCart();
  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-aaau-night/[0.78] backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <BrandLogo className="h-11 w-11 sm:h-12 sm:w-12" priority />
          <div>
            <p className="font-display text-xl uppercase tracking-[0.12em] text-white sm:text-2xl">
              AAAU
            </p>
            <p className="text-[0.6rem] uppercase tracking-[0.24em] text-white/50 sm:text-xs sm:tracking-[0.26em]">
              Uniritter
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 xl:gap-8 lg:flex">
          {siteConfig.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href as Route}
              className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.65] transition hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <button
            type="button"
            onClick={openCart}
            className="inline-flex h-11 items-center gap-3 rounded-full border border-white/[0.12] bg-white/5 px-4 xl:h-12 xl:px-5 text-xs xl:text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-white/25"
          >
            <ShoppingBag className="h-4 w-4" />
            Carrinho
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-aaau-ember px-2 text-[0.72rem] text-white">
              {itemCount}
            </span>
          </button>

          <Link href="/produtos" className={buttonVariants({ variant: "primary", size: "md" })}>
            Comprar agora
          </Link>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={openCart}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-white/[0.12] bg-white/5 px-3 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-white sm:h-11 sm:px-4 sm:text-xs"
          >
            <ShoppingBag className="h-4 w-4" />
            {itemCount}
          </button>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
