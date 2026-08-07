import type { Metadata } from "next";

import { TransferPageShell } from "@/components/events/transfer-page-shell";
import { buttonVariants } from "@/components/shared/button";
import { getRecipientAcceptanceView } from "@/lib/events/transfer-flow";
import { acceptTransferAction, rejectTransferAction } from "../../actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Aceitar ingresso | AAAU", robots: { index: false, follow: false }, referrer: "no-referrer" };

function Field({ name, label, required = false, type = "text" }: { name: string; label: string; required?: boolean; type?: string }) {
  return <label className="block text-sm text-white/75">{label}<input name={name} type={type} required={required} maxLength={160} className="mt-2 w-full rounded-[0.35rem] border border-white/15 bg-aaau-night px-3 py-2 text-white" /></label>;
}

export default async function AcceptTransferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getRecipientAcceptanceView(token);
  if (view.state === "EXPIRED") return <TransferPageShell title="Link expirado"><p>Este convite não está mais disponível.</p></TransferPageShell>;
  if (view.state === "INVALID") return <TransferPageShell title="Link indisponível"><p>Não foi possível validar este convite.</p></TransferPageShell>;
  const { transfer } = view;
  const event = transfer.ticket.event;
  return (
    <TransferPageShell title="Aceitar ingresso">
      <p><strong className="text-white">Evento:</strong> {event.name}</p>
      <p><strong className="text-white">Data:</strong> {event.startAt.toLocaleString("pt-BR")}</p>
      <p><strong className="text-white">Local:</strong> {event.venueAddress || event.venueName}</p>
      <p><strong className="text-white">Lote:</strong> {transfer.ticket.lot.name}</p>
      <p>Ao aceitar, o QR Code e o código anteriores serão invalidados. Nenhum pagamento é processado nesta etapa.</p>
      <form action={acceptTransferAction.bind(null, token)} className="grid gap-4 pt-2 sm:grid-cols-2">
        <Field name="name" label="Nome completo" required />
        <Field name="cpf" label="CPF" required />
        <label className="block text-sm text-white/75">E-mail confirmado<input value={transfer.toHolderEmail} readOnly disabled className="mt-2 w-full rounded-[0.35rem] border border-white/15 bg-white/5 px-3 py-2 text-white/60" /></label>
        {event.requireParticipantPhone ? <Field name="phone" label="Telefone" required /> : null}
        {event.requireBirthDate ? <Field name="birthDate" label="Nascimento" type="date" required /> : null}
        {event.requireInstitution ? <Field name="institution" label="Instituição" required /> : null}
        {event.requireCourse ? <Field name="course" label="Curso" required /> : null}
        {event.requireCampus ? <Field name="campus" label="Campus" required /> : null}
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <button className={buttonVariants({ size: "md" })} type="submit">Aceitar ingresso</button>
        </div>
      </form>
      <form action={rejectTransferAction.bind(null, token)}><button className={buttonVariants({ variant: "secondary", size: "md" })} type="submit">Recusar convite</button></form>
    </TransferPageShell>
  );
}
