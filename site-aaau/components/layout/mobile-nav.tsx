"use client";

import Link from "next/link";
import type { Route } from "next";
import { Menu, X } from "lucide-react";
import { useState } from "react";

import { LogoMark } from "@/components/shared/logo-mark";
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
            "absolute right-0 top-0 flex h-full w-[86vw] max-w-sm flex-col border-l border-white/10 bg-[#111111] p-6 transition duration-300",
            open ? "translate-x-0" : "translate-x-full",
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LogoMark />
              <div>
                <p className="font-display text-2xl uppercase tracking-[0.12em] text-white">
                  AAAU
                </p>
                <p className="text-xs uppercase tracking-[0.22em] text-white/50">
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

          <nav className="mt-10 flex flex-col gap-3">
            {siteConfig.nav.map((item) => (
              <Link
                key={item.href}
                href={item.href as Route}
                onClick={() => setOpen(false)}
                className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-white/80"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto">
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
