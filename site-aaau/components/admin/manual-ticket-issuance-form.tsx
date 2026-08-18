"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { issueManualTicketAction, type AdminEventFormState } from "@/app/admin/eventos/actions";
import { Button } from "@/components/shared/button";

const initialState: AdminEventFormState = { status: "idle" };
const inputClass = "h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-aaau-ember";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Emitindo..." : "Confirmar e emitir"}</Button>;
}

export function ManualTicketIssuanceForm({
  eventId,
  eventName,
  requirements,
}: {
  eventId: string;
  eventName: string;
  requirements: { phone: boolean; birthDate: boolean; institution: boolean; course: boolean; campus: boolean };
}) {
  const [state, action] = useActionState(issueManualTicketAction, initialState);
  const [confirming, setConfirming] = useState(false);
  const [type, setType] = useState<"ADMIN_PIX" | "COMPLIMENTARY">("ADMIN_PIX");
  const [values, setValues] = useState({ name: "", cpf: "", email: "", amountReceived: "", phone: "", birthDate: "", institution: "", course: "", campus: "" });
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (state.status === "success") setIdempotencyKey(crypto.randomUUID());
  }, [state]);
  const set = (field: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) => setValues((current) => ({ ...current, [field]: event.target.value }));

  return (
    <details className="rounded-[1.25rem] border border-aaau-ember/30 bg-aaau-ember/[0.06] p-4">
      <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.16em] text-white">Emitir ingresso</summary>
      <form action={action} className="mt-5 space-y-4">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-white/60">Nome completo<input className={inputClass} name="name" required value={values.name} onChange={set("name")} /></label>
          <label className="space-y-1 text-xs text-white/60">CPF<input className={inputClass} name="cpf" required value={values.cpf} onChange={set("cpf")} /></label>
          <label className="space-y-1 text-xs text-white/60">E-mail<input className={inputClass} name="email" type="email" required value={values.email} onChange={set("email")} /></label>
          <label className="space-y-1 text-xs text-white/60">Tipo<select className={inputClass} name="type" value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="ADMIN_PIX">Venda via PIX</option><option value="COMPLIMENTARY">Cortesia</option></select></label>
          <label className="space-y-1 text-xs text-white/60">Valor recebido<input className={inputClass} name="amountReceived" inputMode="decimal" required={type === "ADMIN_PIX"} disabled={type === "COMPLIMENTARY"} value={type === "COMPLIMENTARY" ? "0,00" : values.amountReceived} onChange={set("amountReceived")} /></label>
          {requirements.phone ? <label className="space-y-1 text-xs text-white/60">WhatsApp<input className={inputClass} name="phone" required value={values.phone} onChange={set("phone")} /></label> : null}
          {requirements.birthDate ? <label className="space-y-1 text-xs text-white/60">Data de nascimento<input className={inputClass} name="birthDate" type="date" required value={values.birthDate} onChange={set("birthDate")} /></label> : null}
          {requirements.institution ? <label className="space-y-1 text-xs text-white/60">Instituicao<input className={inputClass} name="institution" required value={values.institution} onChange={set("institution")} /></label> : null}
          {requirements.course ? <label className="space-y-1 text-xs text-white/60">Curso<input className={inputClass} name="course" required value={values.course} onChange={set("course")} /></label> : null}
          {requirements.campus ? <label className="space-y-1 text-xs text-white/60">Campus<input className={inputClass} name="campus" required value={values.campus} onChange={set("campus")} /></label> : null}
        </div>
        {!confirming ? <Button type="button" onClick={() => setConfirming(true)}>Revisar emissao</Button> : (
          <div className="space-y-3 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/70">
            <p><strong className="text-white">Evento:</strong> {eventName}</p><p><strong className="text-white">Participante:</strong> {values.name}</p>
            <p><strong className="text-white">CPF:</strong> {values.cpf}</p><p><strong className="text-white">E-mail:</strong> {values.email}</p>
            <p><strong className="text-white">Tipo:</strong> {type === "ADMIN_PIX" ? "Venda via PIX" : "Cortesia"}</p>
            <p><strong className="text-white">Valor:</strong> {type === "COMPLIMENTARY" ? "R$ 0,00" : values.amountReceived}</p>
            <div className="flex flex-wrap gap-2"><SubmitButton /><Button type="button" variant="secondary" onClick={() => setConfirming(false)}>Editar</Button></div>
          </div>
        )}
        {state.message ? <p className={state.status === "error" ? "text-sm text-red-200" : "text-sm text-emerald-200"}>{state.message}</p> : null}
      </form>
    </details>
  );
}
