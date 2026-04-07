import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { getAdminSession, isAdminAuthConfigured } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Login Admin",
};

export default async function AdminLoginPage() {
  const session = await getAdminSession();

  if (session) {
    redirect("/admin");
  }

  const isConfigured = isAdminAuthConfigured();

  return (
    <section className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[0.95fr,1.05fr] lg:px-8">
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/[0.45]">
          Admin login
        </p>
        <h1 className="mt-4 font-display text-5xl uppercase tracking-[0.08em] text-white">
          Acesso inicial da gestao.
        </h1>
        <p className="mt-4 text-base leading-8 text-white/[0.68]">
          O painel agora exige credenciais vindas do ambiente de deploy e cria uma
          sessao via cookie assinado no servidor.
        </p>
      </div>

      <AdminLoginForm isConfigured={isConfigured} />
    </section>
  );
}
