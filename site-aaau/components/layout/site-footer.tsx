import Link from "next/link";
import type { Route } from "next";

import { LogoMark } from "@/components/shared/logo-mark";
import { contactInfo, siteConfig } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#070707]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.2fr,0.8fr,0.8fr] lg:px-8">
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <LogoMark />
            <div>
              <p className="font-display text-2xl uppercase tracking-[0.12em] text-white">
                AAAU
              </p>
              <p className="text-xs uppercase tracking-[0.22em] text-white/50">
                Associação Atlética Acadêmica Uniritter
              </p>
            </div>
          </div>
          <p className="max-w-xl text-sm leading-7 text-white/[0.65]">
            Marca, comunidade e performance em uma base digital pronta para evoluir
            com catálogo, pedidos, campanhas e experiências imersivas.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
            Navegação
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {siteConfig.nav.map((item) => (
              <Link
                key={item.href}
                href={item.href as Route}
                className="text-sm text-white/70 transition hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
            Contato
          </p>
          <div className="mt-4 space-y-3 text-sm text-white/70">
            <p>{contactInfo.instagram}</p>
            <p>{contactInfo.whatsapp}</p>
            <p>{contactInfo.email}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
