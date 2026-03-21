import Link from "next/link";
import type { Metadata } from "next";

import { buttonVariants } from "@/components/shared/button";

export const metadata: Metadata = {
  title: "Login Admin",
};

export default function AdminLoginPage() {
  return (
    <section className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[0.95fr,1.05fr] lg:px-8">
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
          Admin login
        </p>
        <h1 className="mt-4 font-display text-5xl uppercase tracking-[0.08em] text-white">
          Acesso inicial da gestão.
        </h1>
        <p className="mt-4 text-base leading-8 text-white/[0.68]">
          Tela base de autenticação pronta para evoluir com provider real, sessão
          persistente e integração com Supabase/Auth no futuro.
        </p>
      </div>

      <form className="space-y-5 rounded-[2rem] border border-white/10 bg-black/20 p-8">
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">
            E-mail
          </span>
          <input
            defaultValue="admin@aaauuniritter.com.br"
            className="h-12 w-full rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 text-sm text-white"
          />
        </label>
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">
            Senha
          </span>
          <input
            type="password"
            defaultValue="dev-only"
            className="h-12 w-full rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 text-sm text-white"
          />
        </label>

        <Link
          href="/admin"
          className={buttonVariants({ variant: "primary", size: "lg", className: "w-full" })}
        >
          Entrar no painel
        </Link>
      </form>
    </section>
  );
}
