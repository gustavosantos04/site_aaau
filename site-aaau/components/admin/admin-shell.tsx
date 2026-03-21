import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

import { siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

export function AdminShell({
  title,
  description,
  activeHref,
  children,
}: {
  title: string;
  description: string;
  activeHref: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-7xl space-y-10 px-4 py-12 sm:px-6 lg:px-8">
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
          Área admin
        </p>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <h1 className="font-display text-5xl uppercase tracking-[0.08em] text-white">
              {title}
            </h1>
            <p className="text-base leading-7 text-white/[0.65]">{description}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {siteConfig.adminLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href as Route}
                className={cn(
                  "rounded-full border px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] transition",
                  activeHref === item.href
                    ? "border-aaau-ember bg-aaau-ember text-white"
                    : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/25 hover:text-white",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {children}
    </section>
  );
}
