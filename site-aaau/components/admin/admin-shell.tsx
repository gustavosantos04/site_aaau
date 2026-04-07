import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

import { logoutAdminAction } from "@/app/admin/actions";
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
    <section className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6 sm:py-12 lg:space-y-10 lg:px-8">
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
          Area admin
        </p>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <h1 className="font-display text-4xl uppercase tracking-[0.08em] text-white sm:text-5xl">
              {title}
            </h1>
            <p className="text-base leading-7 text-white/[0.65]">{description}</p>
          </div>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {siteConfig.adminLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href as Route}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] transition",
                  activeHref === item.href
                    ? "border-aaau-ember bg-aaau-ember text-white"
                    : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/25 hover:text-white",
                )}
              >
                {item.label}
              </Link>
            ))}
            <form action={logoutAdminAction}>
              <button
                type="submit"
                className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/70 transition hover:border-white/25 hover:text-white"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </div>

      {children}
    </section>
  );
}
