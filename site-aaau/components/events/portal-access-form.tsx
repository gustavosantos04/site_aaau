"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { requestPortalAccessAction, type PortalAccessFormState } from "@/app/meus-ingressos/actions";
import { buttonVariants } from "@/components/shared/button";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonVariants({ size: "lg", className: "w-full sm:w-auto" })}>
      {pending ? "Enviando…" : "Enviar link de acesso"}
    </button>
  );
}

export function PortalAccessForm({ initialMessage = "" }: { initialMessage?: string }) {
  const initialState: PortalAccessFormState = { message: initialMessage };
  const [state, action] = useActionState(requestPortalAccessAction, initialState);
  return (
    <form action={action} className="mt-8 space-y-5">
      <label className="block text-sm font-semibold text-white" htmlFor="portal-email">
        E-mail usado nos ingressos
      </label>
      <input
        id="portal-email"
        name="email"
        type="email"
        required
        maxLength={160}
        autoComplete="email"
        inputMode="email"
        className="h-12 w-full rounded-[0.45rem] border border-white/15 bg-aaau-night px-4 text-base text-white outline-none transition placeholder:text-white/35 focus:border-aaau-sand focus:ring-2 focus:ring-aaau-sand/30"
        placeholder="voce@exemplo.com"
      />
      <SubmitButton />
      <p className="text-xs leading-6 text-white/55">Confira também as pastas de spam e promoções. Você pode reenviar após alguns minutos.</p>
      <p aria-live="polite" role="status" className="min-h-7 rounded-[0.4rem] text-sm leading-7 text-aaau-sand">
        {state.message}
      </p>
    </form>
  );
}
