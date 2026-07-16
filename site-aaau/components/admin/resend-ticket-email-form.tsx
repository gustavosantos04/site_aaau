"use client";

import { useFormStatus } from "react-dom";

import { resendTicketEmailAction } from "@/app/admin/eventos/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs font-semibold uppercase tracking-[0.14em] text-aaau-sand disabled:cursor-wait disabled:opacity-50"
    >
      {pending ? "Enviando..." : "Enviar novamente"}
    </button>
  );
}

export function ResendTicketEmailForm({
  eventId,
  eventOrderId,
  alreadySent,
}: {
  eventId: string;
  eventOrderId: string;
  alreadySent: boolean;
}) {
  return (
    <form
      action={resendTicketEmailAction}
      onSubmit={(event) => {
        const message = alreadySent
          ? "Este pedido já recebeu um e-mail. Deseja enviar os mesmos ingressos novamente?"
          : "Deseja enviar os ingressos deste pedido agora?";
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="eventOrderId" value={eventOrderId} />
      <input type="hidden" name="confirmAmbiguous" value="on" />
      <SubmitButton />
    </form>
  );
}
