import { buttonVariants } from "@/components/shared/button";
import { eventTicketTransferRequiresBirthDate } from "@/lib/events/transfer-validation";

type RecipientEvent = {
  name: string;
  startAt: Date;
  venueName: string;
  venueAddress: string | null;
  requireParticipantPhone: boolean;
  requireBirthDate: boolean;
  requireInstitution: boolean;
  requireCourse: boolean;
  requireCampus: boolean;
  minimumAge: number | null;
};

function Field({
  name,
  label,
  required = false,
  type = "text",
  max,
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  max?: string;
}) {
  return (
    <label className="block text-sm text-white/75">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        max={max}
        maxLength={type === "date" ? undefined : 160}
        className="mt-2 w-full rounded-[0.35rem] border border-white/15 bg-aaau-night px-3 py-2 text-white"
      />
    </label>
  );
}

export function latestAllowedBirthDate(startAt: Date, minimumAge: number | null) {
  if (minimumAge === null) return undefined;
  const limit = new Date(startAt);
  limit.setUTCFullYear(limit.getUTCFullYear() - minimumAge);
  return limit.toISOString().slice(0, 10);
}

export function TransferRecipientForm({
  event,
  lotName,
  recipientEmail,
  inputError,
  acceptAction,
  rejectAction,
}: {
  event: RecipientEvent;
  lotName: string;
  recipientEmail: string;
  inputError?: boolean;
  acceptAction: (formData: FormData) => void | Promise<void>;
  rejectAction: () => void | Promise<void>;
}) {
  const requiresBirthDate = eventTicketTransferRequiresBirthDate(event);
  return (
    <>
      <p><strong className="text-white">Evento:</strong> {event.name}</p>
      <p><strong className="text-white">Data:</strong> {event.startAt.toLocaleString("pt-BR")}</p>
      <p><strong className="text-white">Local:</strong> {event.venueAddress || event.venueName}</p>
      <p><strong className="text-white">Lote:</strong> {lotName}</p>
      <p>Ao aceitar, o QR Code e o código anteriores serão invalidados. Nenhum pagamento é processado nesta etapa.</p>
      {inputError ? (
        <p role="alert" className="rounded-[0.5rem] border border-red-300/30 bg-red-300/10 p-3 text-sm text-red-100">
          Revise os dados informados. A solicitação continua ativa e você pode tentar novamente.
        </p>
      ) : null}
      <form action={acceptAction} className="grid gap-4 pt-2 sm:grid-cols-2">
        <Field name="name" label="Nome completo" required />
        <Field name="cpf" label="CPF" required />
        <label className="block text-sm text-white/75">E-mail confirmado<input value={recipientEmail} readOnly disabled className="mt-2 w-full rounded-[0.35rem] border border-white/15 bg-white/5 px-3 py-2 text-white/60" /></label>
        {event.requireParticipantPhone ? <Field name="phone" label="Telefone" required /> : null}
        {requiresBirthDate ? (
          <Field
            name="birthDate"
            label={event.minimumAge !== null ? `Nascimento (idade mínima: ${event.minimumAge} anos)` : "Nascimento"}
            type="date"
            required
            max={latestAllowedBirthDate(event.startAt, event.minimumAge)}
          />
        ) : null}
        {event.requireInstitution ? <Field name="institution" label="Instituição" required /> : null}
        {event.requireCourse ? <Field name="course" label="Curso" required /> : null}
        {event.requireCampus ? <Field name="campus" label="Campus" required /> : null}
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <button className={buttonVariants({ size: "md" })} type="submit">Aceitar ingresso</button>
        </div>
      </form>
      <form action={rejectAction}><button className={buttonVariants({ variant: "secondary", size: "md" })} type="submit">Recusar convite</button></form>
    </>
  );
}
