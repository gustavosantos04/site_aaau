"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  cancelPortalTransferAction,
  requestPortalTransferAction,
  resendPortalTransferAction,
  type PortalMutationState,
} from "@/app/meus-ingressos/painel/actions";
import { buttonVariants } from "@/components/shared/button";

function PendingButton({ idle, pending, variant = "secondary" }: {
  idle: string;
  pending: string;
  variant?: "primary" | "secondary";
}) {
  const status = useFormStatus();
  return <button type="submit" disabled={status.pending} className={buttonVariants({ variant, size: "sm" })}>{status.pending ? pending : idle}</button>;
}

export function CopyTicketCodeButton({ code }: { code: string }) {
  const [message, setMessage] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setMessage("Código copiado.");
    } catch {
      setMessage("Não foi possível copiar. Selecione o código manualmente.");
    }
  }
  return (
    <div>
      <button type="button" onClick={copy} className={buttonVariants({ variant: "secondary", size: "sm" })}>Copiar código</button>
      <span className="ml-3 text-xs text-white/60" aria-live="polite">{message}</span>
    </div>
  );
}

export function PortalTransferForm({ ticketId }: { ticketId: string }) {
  const initial: PortalMutationState = { ok: false, message: "" };
  const [state, action] = useActionState(requestPortalTransferAction.bind(null, ticketId), initial);
  return (
    <form action={action} className="mt-5 space-y-4 rounded-[0.45rem] border border-white/10 bg-black/15 p-4">
      <div className="space-y-2 text-xs leading-5 text-white/65">
        <p>A AAAU apenas transfere a titularidade. Pagamentos e negociações entre pessoas não são processados nem garantidos pelo site.</p>
        <p>A transferência termina somente após o aceite do novo titular. Nesse momento, o QR e o código anteriores deixam de funcionar.</p>
        <p>Ingressos utilizados não podem ser transferidos e a AAAU pode encerrar transferências próximo ao evento.</p>
      </div>
      <label className="block text-sm font-semibold text-white">
        E-mail do destinatário
        <input name="recipientEmail" type="email" required maxLength={160} autoComplete="email" className="mt-2 h-11 w-full rounded-[0.4rem] border border-white/15 bg-aaau-night px-3 text-white outline-none focus:border-aaau-sand focus:ring-2 focus:ring-aaau-sand/30" />
      </label>
      <label className="flex items-start gap-3 text-sm leading-6 text-white/70">
        <input name="confirmed" value="yes" type="checkbox" required className="mt-1 h-4 w-4 accent-aaau-ember" />
        Confirmo que desejo iniciar a transferência deste ingresso.
      </label>
      <PendingButton idle="Transferir ingresso" pending="Solicitando…" variant="primary" />
      <p role="status" aria-live="polite" className={state.ok ? "text-sm text-aaau-sand" : "text-sm text-white/60"}>{state.message}</p>
    </form>
  );
}

export function PendingTransferControls({ ticketId }: { ticketId: string }) {
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      <form action={resendPortalTransferAction.bind(null, ticketId)}><PendingButton idle="Reenviar e-mail" pending="Reenviando…" /></form>
      <form action={cancelPortalTransferAction.bind(null, ticketId)}><PendingButton idle="Cancelar transferência" pending="Cancelando…" /></form>
    </div>
  );
}
