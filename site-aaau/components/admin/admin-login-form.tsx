"use client";

import { useActionState } from "react";

import type { AdminLoginFormState } from "@/app/admin/login/actions";
import { loginAdminAction } from "@/app/admin/login/actions";
import { buttonVariants } from "@/components/shared/button";

const initialState: AdminLoginFormState = {
  status: "idle",
};

export function AdminLoginForm({ isConfigured }: { isConfigured: boolean }) {
  const [state, formAction, pending] = useActionState(loginAdminAction, initialState);

  return (
    <form action={formAction} className="space-y-5 rounded-[2rem] border border-white/10 bg-black/20 p-8">
      <label className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">
          E-mail
        </span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="admin@aaauuniritter.com.br"
          className="h-12 w-full rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 text-sm text-white outline-none transition focus:border-aaau-ember"
        />
      </label>
      <label className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/[0.45]">
          Senha
        </span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Sua senha de admin"
          className="h-12 w-full rounded-[1rem] border border-white/[0.12] bg-black/20 px-4 text-sm text-white outline-none transition focus:border-aaau-ember"
        />
      </label>

      {state.message ? (
        <p className="rounded-[1rem] border border-aaau-ember/20 bg-aaau-ember/10 px-4 py-3 text-sm text-white/80">
          {state.message}
        </p>
      ) : null}

      {!isConfigured ? (
        <p className="text-sm leading-7 text-white/[0.65]">
          O login só é habilitado quando as envs de admin estão configuradas no ambiente.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !isConfigured}
        className={buttonVariants({
          variant: "primary",
          size: "lg",
          className: "w-full disabled:pointer-events-none disabled:opacity-60",
        })}
      >
        {pending ? "Validando..." : "Entrar no painel"}
      </button>
    </form>
  );
}
