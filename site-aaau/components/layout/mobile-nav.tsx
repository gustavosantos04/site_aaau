"use client";

import Link from "next/link";
import type { Route } from "next";
import { Menu, X } from "lucide-react";
import { useState } from "react";

import { BrandLogo } from "@/components/shared/brand-logo";
import { buttonVariants } from "@/components/shared/button";
import { siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.12] bg-white/5 text-white"
        aria-label="Abrir menu"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <div
        className={cn(
          "fixed inset-0 z-40 bg-aaau-night/80 backdrop-blur-lg transition",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <div
          className={cn(
            "absolute right-0 top-0 flex h-full w-[88vw] max-w-sm flex-col border-l border-white/10 bg-[#111111] px-5 py-6 transition duration-300 sm:px-6",
            open ? "translate-x-0" : "translate-x-full",
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-3.5">
              <BrandLogo className="h-12 w-12" imageClassName="scale-[1.08]" />
              <div className="min-w-0 leading-none">
                <p className="font-display text-2xl uppercase tracking-[0.12em] text-white">
                  AAAU
                </p>
                <p className="mt-1 text-[0.62rem] uppercase tracking-[0.24em] text-white/48 sm:text-xs">
                  Uniritter
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.12] bg-white/5 text-white"
              aria-label="Fechar menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="mt-8 flex flex-col gap-3">
            {siteConfig.nav.map((item) => (
              <Link
                key={item.href}
                href={item.href as Route}
                onClick={() => setOpen(false)}
                className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-sm font-semibold uppercase tracking-[0.16em] text-white/80"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto space-y-4 pt-8">
            <p className="text-xs leading-6 text-white/[0.58]">
              Navegação pensada para celular, com acesso rápido ao catálogo e ao
              carrinho.
            </p>
            <Link
              href="/produtos"
              onClick={() => setOpen(false)}
              className={buttonVariants({
                variant: "primary",
                size: "lg",
                className: "w-full",
              })}
            >
              Ver catálogo
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
