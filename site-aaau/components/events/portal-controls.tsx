"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  cancelPortalTransferAction,
  requestPortalTransferAction,
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

type TransferEventRequirements = {
  startAt: string;
  minimumAge: number | null;
  requireParticipantPhone: boolean;
  requireInstitution: boolean;
  requireCourse: boolean;
  requireCampus: boolean;
};

type TransferReview = {
  name: string;
  cpf: string;
  recipientEmail: string;
  phone: string;
  birthDate: string;
  institution: string;
  course: string;
  campus: string;
};

function TransferField({ name, label, required = false, type = "text", max }: {
  name: keyof TransferReview;
  label: string;
  required?: boolean;
  type?: string;
  max?: string;
}) {
  return <label className="block text-sm font-semibold text-white">{label}<input name={name} type={type} required={required} max={max} maxLength={type === "date" ? undefined : 160} className="mt-2 h-11 w-full rounded-[0.4rem] border border-white/15 bg-aaau-night px-3 text-white outline-none focus:border-aaau-sand focus:ring-2 focus:ring-aaau-sand/30" /></label>;
}

function maskedCpf(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 ? `***.***.***-${digits.slice(-2)}` : "CPF mascarado";
}

function latestAllowedBirthDate(startAt: Date, minimumAge: number | null) {
  if (minimumAge === null) return undefined;
  const limit = new Date(startAt);
  limit.setUTCFullYear(limit.getUTCFullYear() - minimumAge);
  return limit.toISOString().slice(0, 10);
}

export function PortalTransferForm({ ticketId, event, requestId }: {
  ticketId: string;
  event: TransferEventRequirements;
  requestId: string;
}) {
  const initial: PortalMutationState = { ok: false, message: "" };
  const [state, action] = useActionState(requestPortalTransferAction.bind(null, ticketId), initial);
  const [review, setReview] = useState<TransferReview | null>(null);
  const maxBirthDate = latestAllowedBirthDate(new Date(event.startAt), event.minimumAge) ?? new Date().toISOString().slice(0, 10);

  function reviewTransfer(formData: FormData) {
    setReview({
      name: String(formData.get("name") ?? ""),
      cpf: String(formData.get("cpf") ?? ""),
      recipientEmail: String(formData.get("recipientEmail") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      birthDate: String(formData.get("birthDate") ?? ""),
      institution: String(formData.get("institution") ?? ""),
      course: String(formData.get("course") ?? ""),
      campus: String(formData.get("campus") ?? ""),
    });
  }

  if (state.ok) return <p role="status" className="mt-5 rounded-[0.45rem] border border-aaau-sand/30 bg-aaau-sand/10 p-4 text-sm text-aaau-sand">{state.message}</p>;
  if (review) return (
    <form action={action} className="mt-5 space-y-4 rounded-[0.45rem] border border-aaau-sand/25 bg-aaau-sand/10 p-4">
      <p className="font-semibold text-white">Você está transferindo este ingresso para:</p>
      <dl className="space-y-2 text-sm text-white/75">
        <div><dt className="inline font-semibold text-white">Nome: </dt><dd className="inline">{review.name}</dd></div>
        <div><dt className="inline font-semibold text-white">CPF: </dt><dd className="inline">{maskedCpf(review.cpf)}</dd></div>
        <div><dt className="inline font-semibold text-white">E-mail: </dt><dd className="inline">{review.recipientEmail}</dd></div>
      </dl>
      <p className="text-sm leading-6 text-white/75">Depois da confirmação, seu ingresso atual será invalidado e o novo titular receberá uma nova credencial. A transferência não exige aceite e não pode ser desfeita pelo antigo titular.</p>
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="confirmed" value="yes" />
      {Object.entries(review).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <div className="flex flex-wrap gap-3">
        <PendingButton idle="CONFIRMAR TRANSFERÊNCIA" pending="TRANSFERINDO…" variant="primary" />
        <button type="button" onClick={() => setReview(null)} className={buttonVariants({ variant: "secondary", size: "sm" })}>Corrigir dados</button>
      </div>
      <p role="status" aria-live="polite" className="text-sm text-white/60">{state.message}</p>
    </form>
  );
  return (
    <form action={reviewTransfer} className="mt-5 space-y-4 rounded-[0.45rem] border border-white/10 bg-black/15 p-4">
      <div className="space-y-2 text-xs leading-5 text-white/65">
        <p>A AAAU apenas transfere a titularidade. Pagamentos e negociações entre pessoas não são processados nem garantidos pelo site.</p>
        <p>A transferência é concluída imediatamente após sua confirmação. O QR e o código anteriores deixam de funcionar.</p>
        <p>Ingressos utilizados não podem ser transferidos e a AAAU pode encerrar transferências próximo ao evento.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TransferField name="name" label="Nome completo" required />
        <TransferField name="cpf" label="CPF" required />
        <TransferField name="recipientEmail" label="E-mail" type="email" required />
        <TransferField name="birthDate" label={event.minimumAge === null ? "Data de nascimento" : `Data de nascimento (idade mínima: ${event.minimumAge} anos)`} type="date" max={maxBirthDate} required />
        {event.requireParticipantPhone ? <TransferField name="phone" label="WhatsApp" required /> : null}
        {event.requireInstitution ? <TransferField name="institution" label="Instituição" required /> : null}
        {event.requireCourse ? <TransferField name="course" label="Curso" required /> : null}
        {event.requireCampus ? <TransferField name="campus" label="Campus" required /> : null}
      </div>
      <button className={buttonVariants({ size: "sm" })} type="submit">Revisar transferência</button>
      <p role="status" aria-live="polite" className={state.ok ? "text-sm text-aaau-sand" : "text-sm text-white/60"}>{state.message}</p>
    </form>
  );
}

export function PendingTransferControls({ ticketId }: { ticketId: string }) {
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      <form action={cancelPortalTransferAction.bind(null, ticketId)}><PendingButton idle="Cancelar transferência" pending="Cancelando…" /></form>
    </div>
  );
}
