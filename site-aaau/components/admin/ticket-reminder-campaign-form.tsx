"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { createTicketReminderCampaignAction, type AdminEventFormState } from "@/app/admin/eventos/actions";

const initialState: AdminEventFormState = { status: "idle" };

function Buttons() {
  const { pending } = useFormStatus();
  return <div>
    <button disabled={pending} className="rounded-full bg-aaau-wine px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50">
      {pending ? "Processando..." : "Enviar agora"}
    </button>
  </div>;
}

export function TicketReminderCampaignForm({ eventId }: { eventId: string }) {
  const [state, action] = useActionState(createTicketReminderCampaignAction, initialState);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID());
  }, []);

  return <form action={action} className="space-y-3 rounded-xl border border-aaau-sand/25 bg-black/20 p-4">
    <input type="hidden" name="eventId" value={eventId} />
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <div>
      <h3 className="font-display text-xl uppercase tracking-[0.06em] text-white">Lembrete de ingressos</h3>
      <p className="mt-1 text-xs leading-5 text-white/50">Envio manual imediato. O destinatário e a credencial são consultados no banco somente na hora do envio.</p>
    </div>
    <Buttons />
    {state.message ? <p role="status" className={state.status === "error" ? "text-sm text-red-300" : "text-sm text-emerald-300"}>{state.message}</p> : null}
  </form>;
}
